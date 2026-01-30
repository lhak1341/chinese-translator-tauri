use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::fs;
use std::io::{Read, Write};
use std::path::PathBuf;
use std::sync::{Arc, Mutex};
use std::num::NonZeroU32;
use std::sync::atomic::{AtomicBool, AtomicU64, Ordering};
use tauri::{AppHandle, Emitter, Manager, State};
use zip::write::SimpleFileOptions;
use zip::{ZipArchive, ZipWriter};
use rayon::prelude::*;
use std::time::Instant;
use governor::{Quota, RateLimiter, clock::DefaultClock, state::{InMemoryState, NotKeyed}};

// Import lookup index engine
use crate::lookup_index_engine::{
    build_comprehensive_lookup_index, Dictionary, DictionaryType, IndexBuildOptions, TrieNode,
    CategorizedMatches,
};

// ============================================================================
// SECURITY: Constants and Validation Functions
// ============================================================================

// Size limits to prevent DoS attacks
const MAX_JSON_SIZE_BYTES: usize = 10 * 1024 * 1024; // 10MB
const MAX_TEXT_SIZE_BYTES: usize = 1 * 1024 * 1024;  // 1MB
const MAX_DICTIONARY_ENTRIES: usize = 50_000;
const MAX_DICTIONARY_ID_LENGTH: usize = 100;

/// SECURITY: Validate dictionary ID to prevent path traversal attacks
///
/// Prevents:
/// - Path traversal (../, /, \)
/// - Absolute paths (/, C:)
/// - Null byte injection
/// - Non-alphanumeric characters (except hyphen)
/// - Excessively long IDs
fn validate_dictionary_id(dictionary_id: &str) -> Result<(), String> {
    // Check for path traversal sequences
    if dictionary_id.contains("..") || dictionary_id.contains('/') || dictionary_id.contains('\\') {
        return Err("Invalid dictionary ID: path separators not allowed".to_string());
    }


    // Check for null bytes (can bypass extension checks)
    if dictionary_id.contains('\0') {
        return Err("Invalid dictionary ID: null bytes not allowed".to_string());
    }

    // Blacklist dangerous characters (allow Unicode for international names)
    // Block: control characters (including null bytes checked above)
    if dictionary_id.chars().any(|c| c.is_control()) {
        return Err("Invalid dictionary ID: control characters not allowed".to_string());
    }

    // Enforce maximum length
    if dictionary_id.len() > MAX_DICTIONARY_ID_LENGTH {
        return Err(format!(
            "Invalid dictionary ID: maximum length is {} characters",
            MAX_DICTIONARY_ID_LENGTH
        ));
    }

    // Must not be empty
    if dictionary_id.is_empty() {
        return Err("Invalid dictionary ID: cannot be empty".to_string());
    }

    Ok(())
}

/// SECURITY: Validate file size before reading to prevent DoS
fn validate_file_size(path: &PathBuf, max_size: usize) -> Result<(), String> {
    let metadata = fs::metadata(path).map_err(|e| {
        sanitize_io_error(e, "file")
    })?;

    if metadata.len() > max_size as u64 {
        return Err(format!(
            "File too large: {} MB (max: {} MB)",
            metadata.len() / 1024 / 1024,
            max_size / 1024 / 1024
        ));
    }
    Ok(())
}

/// SECURITY: Sanitize I/O errors to prevent information disclosure
fn sanitize_io_error(error: std::io::Error, context: &str) -> String {
    match error.kind() {
        std::io::ErrorKind::NotFound => format!("{} not found", context),
        std::io::ErrorKind::PermissionDenied => format!("Permission denied accessing {}", context),
        std::io::ErrorKind::AlreadyExists => format!("{} already exists", context),
        _ => {
            // Log full error server-side for debugging
            eprintln!("Error accessing {}: {:?}", context, error);
            // Return generic message to user
            format!("Failed to access {}", context)
        }
    }
}

// CODE REVIEW FIX (2026-01-30): Track mutex poisoning events for monitoring
// Global counters to detect cache corruption and notify frontend
static MUTEX_POISONED: AtomicBool = AtomicBool::new(false);
static POISONING_EVENT_COUNT: AtomicU64 = AtomicU64::new(0);

// Dictionary cache for preventing duplicate loads
pub struct DictionaryCache {
    cache: Mutex<HashMap<String, serde_json::Value>>,
}

impl DictionaryCache {
    pub fn new() -> Self {
        Self {
            cache: Mutex::new(HashMap::new()),
        }
    }

    /// CODE REVIEW FIX: Handle mutex poisoning with cache reset and error logging
    /// Poisoning indicates a panic occurred - corrupted data should not be used
    pub fn get(&self, key: &str) -> Option<serde_json::Value> {
        match self.cache.lock() {
            Ok(cache) => cache.get(key).cloned(),
            Err(poisoned) => {
                // CODE REVIEW FIX (2026-01-30): Track poisoning events for frontend monitoring
                MUTEX_POISONED.store(true, Ordering::SeqCst);
                POISONING_EVENT_COUNT.fetch_add(1, Ordering::SeqCst);

                // CODE REVIEW FIX: Log critical error instead of warning
                eprintln!("CRITICAL: Cache mutex poisoned during get - dictionary cache may be corrupted");
                eprintln!("Poisoning indicates a panic occurred while holding the lock");
                eprintln!("Attempting recovery but cache should be invalidated");

                // Clear the corrupted cache by taking ownership and dropping it
                let mut cache = poisoned.into_inner();
                cache.clear();

                // Return None since cache is now cleared
                None
            }
        }
    }

    /// CODE REVIEW FIX: Handle mutex poisoning with cache reset and error logging
    /// Poisoning indicates a panic occurred - corrupted data should not be used
    pub fn set(&self, key: String, value: serde_json::Value) {
        match self.cache.lock() {
            Ok(mut cache) => {
                cache.insert(key, value);
            }
            Err(poisoned) => {
                // CODE REVIEW FIX (2026-01-30): Track poisoning events for frontend monitoring
                MUTEX_POISONED.store(true, Ordering::SeqCst);
                POISONING_EVENT_COUNT.fetch_add(1, Ordering::SeqCst);

                // CODE REVIEW FIX: Log critical error instead of warning
                eprintln!("CRITICAL: Cache mutex poisoned during set - dictionary cache may be corrupted");
                eprintln!("Poisoning indicates a panic occurred while holding the lock");
                eprintln!("Clearing cache instead of inserting into corrupted state");

                // Clear the corrupted cache instead of inserting into it
                let mut cache = poisoned.into_inner();
                cache.clear();
                // Don't insert the new value - cache is now empty and will rebuild naturally
            }
        }
    }

    /// CODE REVIEW FIX: Handle mutex poisoning with cache reset and error logging
    /// Poisoning indicates a panic occurred - corrupted data should not be used
    pub fn invalidate(&self, dictionary_id: Option<&str>) {
        match self.cache.lock() {
            Ok(mut cache) => {
                if let Some(id) = dictionary_id {
                    cache.retain(|key, _| !key.starts_with(&format!("{}:", id)));
                } else {
                    cache.clear();
                }
            }
            Err(poisoned) => {
                // CODE REVIEW FIX (2026-01-30): Track poisoning events for frontend monitoring
                MUTEX_POISONED.store(true, Ordering::SeqCst);
                POISONING_EVENT_COUNT.fetch_add(1, Ordering::SeqCst);

                // CODE REVIEW FIX: Log critical error instead of warning
                eprintln!("CRITICAL: Cache mutex poisoned during invalidation - dictionary cache may be corrupted");
                eprintln!("Poisoning indicates a panic occurred while holding the lock");
                eprintln!("Clearing entire cache to ensure consistency");

                // Clear the entire cache regardless of dictionary_id
                // Since the cache is corrupted, partial invalidation is unsafe
                let mut cache = poisoned.into_inner();
                cache.clear();
            }
        }
    }
}

// ============================================================================
// SECURITY: Rate Limiters
// ============================================================================

/// Rate limiters for expensive operations to prevent DoS attacks
pub struct RateLimiters {
    build_index: RateLimiter<NotKeyed, InMemoryState, DefaultClock>,
    load_parallel: RateLimiter<NotKeyed, InMemoryState, DefaultClock>,
    export_import: RateLimiter<NotKeyed, InMemoryState, DefaultClock>,
}

impl RateLimiters {
    pub fn new() -> Self {
        Self {
            // 10 build_index calls per minute (expensive operation)
            build_index: RateLimiter::direct(
                Quota::per_minute(NonZeroU32::new(10).unwrap())
            ),
            // 30 load_parallel calls per minute
            load_parallel: RateLimiter::direct(
                Quota::per_minute(NonZeroU32::new(30).unwrap())
            ),
            // 5 export/import operations per minute (very expensive)
            export_import: RateLimiter::direct(
                Quota::per_minute(NonZeroU32::new(5).unwrap())
            ),
        }
    }

    pub fn check_build_index(&self) -> Result<(), String> {
        self.build_index.check()
            .map_err(|_| "Rate limit exceeded for index building. Please wait before retrying.".to_string())
    }

    pub fn check_load_parallel(&self) -> Result<(), String> {
        self.load_parallel.check()
            .map_err(|_| "Rate limit exceeded for parallel loading. Please wait before retrying.".to_string())
    }

    pub fn check_export_import(&self) -> Result<(), String> {
        self.export_import.check()
            .map_err(|_| "Rate limit exceeded for export/import. Please wait before retrying.".to_string())
    }
}

#[derive(Serialize, Deserialize)]
pub struct DictionaryResponse {
    success: bool,
    #[serde(skip_serializing_if = "Option::is_none")]
    data: Option<serde_json::Value>,
    #[serde(skip_serializing_if = "Option::is_none")]
    error: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    dictionaries: Option<Vec<String>>,
    #[serde(skip_serializing_if = "Option::is_none")]
    message: Option<String>,
}

// Get the dictionary directory path
fn get_dictionary_path(app_handle: &tauri::AppHandle) -> Result<PathBuf, String> {
    let app_data_dir = app_handle
        .path()
        .app_data_dir()
        .map_err(|e| e.to_string())?;
    Ok(app_data_dir.join("dictionaries"))
}

// Get cache key for dictionary
fn get_cache_key(dictionary_id: &str, file_path: &PathBuf) -> String {
    format!("{}:{}", dictionary_id, file_path.display())
}

#[tauri::command]
pub async fn open_dictionary_folder(app_handle: tauri::AppHandle) -> Result<DictionaryResponse, String> {
    let dictionary_path = get_dictionary_path(&app_handle)?;

    // Create directory if it doesn't exist
    fs::create_dir_all(&dictionary_path).map_err(|e| e.to_string())?;

    // Open folder using opener plugin
    use tauri_plugin_opener::OpenerExt;
    app_handle.opener()
        .open_path(dictionary_path.to_string_lossy().to_string(), None::<&str>)
        .map_err(|e| e.to_string())?;

    Ok(DictionaryResponse {
        success: true,
        data: None,
        error: None,
        dictionaries: None,
        message: None,
    })
}

#[tauri::command]
pub async fn list_proper_nouns_dictionaries(app_handle: tauri::AppHandle) -> Result<DictionaryResponse, String> {
    let dictionary_path = get_dictionary_path(&app_handle)?;

    // Create directory if it doesn't exist
    fs::create_dir_all(&dictionary_path).map_err(|e| e.to_string())?;

    let entries = fs::read_dir(&dictionary_path).map_err(|e| e.to_string())?;

    let proper_nouns_dicts: Vec<String> = entries
        .filter_map(|entry| {
            entry.ok().and_then(|e| {
                let file_name = e.file_name();
                let file_str = file_name.to_str()?;
                if file_str.starts_with("properNouns") && file_str.ends_with(".json") {
                    Some(file_str.trim_end_matches(".json").to_string())
                } else {
                    None
                }
            })
        })
        .collect();

    Ok(DictionaryResponse {
        success: true,
        data: None,
        error: None,
        dictionaries: Some(proper_nouns_dicts),
        message: None,
    })
}

#[tauri::command]
pub async fn create_proper_nouns_dictionary(
    app_handle: tauri::AppHandle,
    dictionary_id: String,
) -> Result<DictionaryResponse, String> {
    // SECURITY: Validate dictionary ID to prevent path traversal
    validate_dictionary_id(&dictionary_id)?;

    let dictionary_path = get_dictionary_path(&app_handle)?;
    let file_path = dictionary_path.join(format!("{}.json", dictionary_id));

    // Check if file already exists
    if file_path.exists() {
        return Ok(DictionaryResponse {
            success: false,
            data: None,
            error: Some("Dictionary already exists".to_string()),
            dictionaries: None,
            message: None,
        });
    }

    // Create empty dictionary
    let empty_dict = serde_json::json!({});
    fs::write(&file_path, serde_json::to_string_pretty(&empty_dict).unwrap())
        .map_err(|e| e.to_string())?;

    Ok(DictionaryResponse {
        success: true,
        data: None,
        error: None,
        dictionaries: None,
        message: None,
    })
}

#[tauri::command]
pub async fn save_dictionary(
    app_handle: tauri::AppHandle,
    cache: State<'_, DictionaryCache>,
    dictionary_id: String,
    data: serde_json::Value,
) -> Result<DictionaryResponse, String> {
    // SECURITY: Validate dictionary ID to prevent path traversal
    validate_dictionary_id(&dictionary_id)?;

    // SECURITY: Check entry count before saving
    if let Some(obj) = data.as_object() {
        if obj.len() > MAX_DICTIONARY_ENTRIES {
            return Err(format!(
                "Dictionary too large: {} entries (max: {})",
                obj.len(),
                MAX_DICTIONARY_ENTRIES
            ));
        }
    }

    let dictionary_path = get_dictionary_path(&app_handle)?;
    fs::create_dir_all(&dictionary_path).map_err(|e| sanitize_io_error(e, "dictionary directory"))?;

    let file_path = dictionary_path.join(format!("{}.json", dictionary_id));

    // Save the data
    let json_string = serde_json::to_string_pretty(&data).map_err(|e| e.to_string())?;

    // SECURITY: Check JSON size before writing
    if json_string.len() > MAX_JSON_SIZE_BYTES {
        return Err(format!(
            "Dictionary too large: {} MB (max: {} MB)",
            json_string.len() / 1024 / 1024,
            MAX_JSON_SIZE_BYTES / 1024 / 1024
        ));
    }

    fs::write(&file_path, json_string).map_err(|e| sanitize_io_error(e, "dictionary file"))?;

    // Invalidate cache for this dictionary
    cache.invalidate(Some(&dictionary_id));

    // Verify the file was written
    let verify_data: serde_json::Value = serde_json::from_str(
        &fs::read_to_string(&file_path).map_err(|e| e.to_string())?
    ).map_err(|e| e.to_string())?;

    Ok(DictionaryResponse {
        success: true,
        data: Some(verify_data),
        error: None,
        dictionaries: None,
        message: None,
    })
}

#[tauri::command]
pub async fn load_dictionary(
    app_handle: tauri::AppHandle,
    cache: State<'_, DictionaryCache>,
    dictionary_id: String,
) -> Result<DictionaryResponse, String> {
    // SECURITY: Validate dictionary ID to prevent path traversal
    validate_dictionary_id(&dictionary_id)?;

    let dictionary_path = get_dictionary_path(&app_handle)?;
    let file_path = dictionary_path.join(format!("{}.json", dictionary_id));

    let cache_key = get_cache_key(&dictionary_id, &file_path);

    // Check cache first
    if let Some(cached_data) = cache.get(&cache_key) {
        return Ok(DictionaryResponse {
            success: true,
            data: Some(cached_data),
            error: None,
            dictionaries: None,
            message: None,
        });
    }

    // SECURITY: Check file size before reading
    validate_file_size(&file_path, MAX_JSON_SIZE_BYTES)?;

    // Load from file
    match fs::read_to_string(&file_path) {
        Ok(contents) => {
            let data: serde_json::Value = serde_json::from_str(&contents)
                .map_err(|e| format!("Invalid JSON format: {}", e))?;

            // Cache the result
            cache.set(cache_key, data.clone());

            Ok(DictionaryResponse {
                success: true,
                data: Some(data),
                error: None,
                dictionaries: None,
                message: None,
            })
        }
        Err(e) if e.kind() == std::io::ErrorKind::NotFound => {
            Ok(DictionaryResponse {
                success: false,
                data: None,
                error: Some("File not found".to_string()),
                dictionaries: None,
                message: None,
            })
        }
        Err(e) => Err(e.to_string()),
    }
}

#[tauri::command]
pub async fn load_configuration(app_handle: tauri::AppHandle) -> Result<DictionaryResponse, String> {
    let app_data_dir = app_handle.path().app_data_dir().map_err(|e| e.to_string())?;
    let config_path = app_data_dir.join("config.json");

    // SECURITY: Check file size before reading to prevent DoS
    if config_path.exists() {
        validate_file_size(&config_path, MAX_JSON_SIZE_BYTES)?;
    }

    match fs::read_to_string(&config_path) {
        Ok(contents) => {
            let data: serde_json::Value = serde_json::from_str(&contents)
                .map_err(|e| e.to_string())?;
            Ok(DictionaryResponse {
                success: true,
                data: Some(data),
                error: None,
                dictionaries: None,
                message: None,
            })
        }
        Err(e) if e.kind() == std::io::ErrorKind::NotFound => {
            // Return default configuration
            let default_config = serde_json::json!({
                "activeProperNouns": ["properNouns"]
            });
            Ok(DictionaryResponse {
                success: true,
                data: Some(default_config),
                error: None,
                dictionaries: None,
                message: None,
            })
        }
        Err(e) => Err(e.to_string()),
    }
}

#[tauri::command]
pub async fn save_configuration(
    app_handle: tauri::AppHandle,
    config: serde_json::Value,
) -> Result<DictionaryResponse, String> {
    let app_data_dir = app_handle.path().app_data_dir().map_err(|e| e.to_string())?;
    let config_path = app_data_dir.join("config.json");

    let json_string = serde_json::to_string_pretty(&config).map_err(|e| e.to_string())?;
    fs::write(&config_path, json_string).map_err(|e| e.to_string())?;

    Ok(DictionaryResponse {
        success: true,
        data: None,
        error: None,
        dictionaries: None,
        message: None,
    })
}

#[tauri::command]
pub async fn load_appearance_settings(app_handle: tauri::AppHandle) -> Result<DictionaryResponse, String> {
    let app_data_dir = app_handle.path().app_data_dir().map_err(|e| e.to_string())?;
    let appearance_path = app_data_dir.join("appearance.json");

    // SECURITY: Check file size before reading to prevent DoS
    if appearance_path.exists() {
        validate_file_size(&appearance_path, MAX_JSON_SIZE_BYTES)?;
    }

    match fs::read_to_string(&appearance_path) {
        Ok(contents) => {
            let data: serde_json::Value = serde_json::from_str(&contents)
                .map_err(|e| e.to_string())?;
            Ok(DictionaryResponse {
                success: true,
                data: Some(data),
                error: None,
                dictionaries: None,
                message: None,
            })
        }
        Err(e) if e.kind() == std::io::ErrorKind::NotFound => {
            // Return default appearance settings
            let default_appearance = serde_json::json!({
                "chineseText": {
                    "fontFamily": "\"Noto Sans CJK SC\", SimSun, \"Microsoft YaHei\", Inter, system-ui, Arial, sans-serif",
                    "fontSize": "1.25rem",
                    "letterSpacing": "normal"
                },
                "fullTranslation": {
                    "fontFamily": "Bookerly, Amstelvar, \"Noto Sans CJK SC\", Arial, sans-serif",
                    "fontSize": "1.25rem",
                    "letterSpacing": "normal"
                },
                "characterOnly": {
                    "fontFamily": "Bookerly, Amstelvar, \"Noto Sans CJK SC\", Arial, sans-serif",
                    "fontSize": "1.25rem",
                    "letterSpacing": "normal"
                },
                "uiFont": {
                    "fontFamily": "Inter, system-ui, Arial, sans-serif"
                }
            });
            Ok(DictionaryResponse {
                success: true,
                data: Some(default_appearance),
                error: None,
                dictionaries: None,
                message: None,
            })
        }
        Err(e) => Err(e.to_string()),
    }
}

#[tauri::command]
pub async fn save_appearance_settings(
    app_handle: tauri::AppHandle,
    appearance_settings: serde_json::Value,
) -> Result<DictionaryResponse, String> {
    let app_data_dir = app_handle.path().app_data_dir().map_err(|e| e.to_string())?;
    let appearance_path = app_data_dir.join("appearance.json");

    let json_string = serde_json::to_string_pretty(&appearance_settings).map_err(|e| e.to_string())?;
    fs::write(&appearance_path, json_string).map_err(|e| e.to_string())?;

    Ok(DictionaryResponse {
        success: true,
        data: None,
        error: None,
        dictionaries: None,
        message: None,
    })
}

#[tauri::command]
pub async fn export_dictionaries(
    app_handle: tauri::AppHandle,
    limiters: State<'_, RateLimiters>,
) -> Result<DictionaryResponse, String> {
    // SECURITY: Rate limit to prevent abuse
    limiters.check_export_import()?;

    let dictionary_path = get_dictionary_path(&app_handle)?;

    // Use dialog to get save location
    use tauri_plugin_dialog::DialogExt;
    let file_path = app_handle.dialog()
        .file()
        .set_title("Export Dictionaries")
        .set_file_name("dictionaries.zip")
        .add_filter("ZIP Archive", &["zip"])
        .blocking_save_file();

    let file_path = match file_path {
        Some(path) => path.as_path().ok_or("Invalid file path")?.to_path_buf(),
        None => return Ok(DictionaryResponse {
            success: false,
            data: None,
            error: Some("Export cancelled".to_string()),
            dictionaries: None,
            message: None,
        })
    };

    // Create ZIP file
    let zip_file = fs::File::create(&file_path).map_err(|e| e.to_string())?;
    let mut zip = ZipWriter::new(zip_file);
    let options = SimpleFileOptions::default()
        .compression_method(zip::CompressionMethod::Deflated);

    // Read all dictionary files in parallel first
    let entries: Vec<_> = fs::read_dir(&dictionary_path)
        .map_err(|e| e.to_string())?
        .filter_map(|e| e.ok())
        .collect();

    // Parallel read all files into memory
    let file_contents: Vec<_> = entries
        .par_iter()
        .filter_map(|entry| {
            let path = entry.path();
            if path.is_file() && path.extension().and_then(|s| s.to_str()) == Some("json") {
                let file_name = path.file_name()?.to_str()?.to_string();
                let contents = fs::read_to_string(&path).ok()?;
                Some((file_name, contents))
            } else {
                None
            }
        })
        .collect();

    // Write to ZIP sequentially (ZIP format requires sequential writes)
    let mut file_count = 0;
    for (file_name, contents) in file_contents {
        zip.start_file(&file_name, options).map_err(|e| e.to_string())?;
        zip.write_all(contents.as_bytes()).map_err(|e| e.to_string())?;
        file_count += 1;
    }

    zip.finish().map_err(|e| e.to_string())?;

    Ok(DictionaryResponse {
        success: true,
        data: None,
        error: None,
        dictionaries: None,
        message: Some(format!("Exported {} dictionaries successfully", file_count)),
    })
}

#[tauri::command]
pub async fn import_dictionaries(
    app_handle: tauri::AppHandle,
    cache: State<'_, DictionaryCache>,
    limiters: State<'_, RateLimiters>,
) -> Result<DictionaryResponse, String> {
    // SECURITY: Rate limit to prevent abuse
    limiters.check_export_import()?;

    let dictionary_path = get_dictionary_path(&app_handle)?;

    // Use dialog to get file to import
    use tauri_plugin_dialog::DialogExt;
    let file_path = app_handle.dialog()
        .file()
        .set_title("Import Dictionaries")
        .add_filter("ZIP Archive", &["zip"])
        .blocking_pick_file();

    let file_path = match file_path {
        Some(path) => path.as_path().ok_or("Invalid file path")?.to_path_buf(),
        None => return Ok(DictionaryResponse {
            success: false,
            data: None,
            error: Some("Import cancelled".to_string()),
            dictionaries: None,
            message: None,
        })
    };

    // Open ZIP file
    let zip_file = fs::File::open(&file_path).map_err(|e| e.to_string())?;
    let mut archive = ZipArchive::new(zip_file).map_err(|e| e.to_string())?;

    let mut file_count = 0;
    let mut errors = Vec::new();

    // Extract each file
    for i in 0..archive.len() {
        let mut file = archive.by_index(i).map_err(|e| e.to_string())?;
        let filename = file.name().to_string();

        // Only process JSON files
        if !filename.ends_with(".json") {
            continue;
        }

        // Validate JSON before writing
        let mut contents = String::new();
        file.read_to_string(&mut contents).map_err(|e| e.to_string())?;

        match serde_json::from_str::<serde_json::Value>(&contents) {
            Ok(_) => {
                let output_path = dictionary_path.join(&filename);
                fs::write(&output_path, &contents).map_err(|e| e.to_string())?;
                file_count += 1;
            }
            Err(e) => {
                errors.push(format!("{}: {}", filename, e));
            }
        }
    }

    // Clear cache since dictionaries changed
    cache.invalidate(None);

    let message = if errors.is_empty() {
        format!("Imported {} dictionaries successfully", file_count)
    } else {
        format!("Imported {} dictionaries, {} errors: {}", file_count, errors.len(), errors.join(", "))
    };

    Ok(DictionaryResponse {
        success: file_count > 0,
        data: None,
        error: if !errors.is_empty() { Some(errors.join(", ")) } else { None },
        dictionaries: None,
        message: Some(message),
    })
}

#[tauri::command]
pub async fn reset_dictionaries(
    app_handle: tauri::AppHandle,
    cache: State<'_, DictionaryCache>,
    options: Option<serde_json::Value>,
) -> Result<DictionaryResponse, String> {
    let dictionary_path = get_dictionary_path(&app_handle)?;

    // Get backup option (default: true)
    let create_backup = options
        .as_ref()
        .and_then(|o| o.get("backup"))
        .and_then(|v| v.as_bool())
        .unwrap_or(true);

    // Create backup if requested
    if create_backup {
        let backup_dir = dictionary_path.parent()
            .ok_or("Could not get parent directory")?
            .join("dictionaries_backup");

        fs::create_dir_all(&backup_dir).map_err(|e| e.to_string())?;

        // Copy all files to backup
        if dictionary_path.exists() {
            let entries = fs::read_dir(&dictionary_path).map_err(|e| e.to_string())?;

            for entry in entries {
                let entry = entry.map_err(|e| e.to_string())?;
                let path = entry.path();

                if path.is_file() {
                    let file_name = path.file_name()
                        .ok_or("Invalid filename")?;
                    let backup_path = backup_dir.join(file_name);
                    fs::copy(&path, &backup_path).map_err(|e| e.to_string())?;
                }
            }
        }
    }

    // Remove all existing dictionary files
    if dictionary_path.exists() {
        fs::remove_dir_all(&dictionary_path).map_err(|e| e.to_string())?;
    }

    // Recreate dictionary directory
    fs::create_dir_all(&dictionary_path).map_err(|e| e.to_string())?;

    // Clear cache
    cache.invalidate(None);

    let message = if create_backup {
        "Dictionaries reset successfully. Backup created in dictionaries_backup folder."
    } else {
        "Dictionaries reset successfully. No backup created."
    };

    Ok(DictionaryResponse {
        success: true,
        data: None,
        error: None,
        dictionaries: None,
        message: Some(message.to_string()),
    })
}

#[derive(Serialize, Deserialize)]
pub struct BatchDictionaryRequest {
    dictionary_ids: Vec<String>,
}

#[derive(Serialize, Deserialize)]
pub struct BatchDictionaryResult {
    dictionary_id: String,
    success: bool,
    data: Option<serde_json::Value>,
    error: Option<String>,
}

#[derive(Serialize, Deserialize)]
pub struct BatchDictionaryResponse {
    results: Vec<BatchDictionaryResult>,
    total: usize,
    successful: usize,
    failed: usize,
}

#[tauri::command]
pub async fn load_dictionaries_parallel(
    app_handle: tauri::AppHandle,
    cache: State<'_, DictionaryCache>,
    limiters: State<'_, RateLimiters>,
    dictionary_ids: Vec<String>,
) -> Result<BatchDictionaryResponse, String> {
    // SECURITY: Rate limit to prevent abuse
    limiters.check_load_parallel()?;

    let dictionary_path = get_dictionary_path(&app_handle)?;

    // Use Rayon to load dictionaries in parallel across all CPU cores
    let results: Vec<BatchDictionaryResult> = dictionary_ids
        .par_iter()
        .map(|dictionary_id| {
            // SECURITY: Validate dictionary ID to prevent path traversal
            if let Err(e) = validate_dictionary_id(dictionary_id) {
                return BatchDictionaryResult {
                    dictionary_id: dictionary_id.clone(),
                    success: false,
                    data: None,
                    error: Some(e),
                };
            }

            let file_path = dictionary_path.join(format!("{}.json", dictionary_id));
            let cache_key = get_cache_key(dictionary_id, &file_path);

            // Check cache first (thread-safe)
            if let Some(cached_data) = cache.get(&cache_key) {
                return BatchDictionaryResult {
                    dictionary_id: dictionary_id.clone(),
                    success: true,
                    data: Some(cached_data),
                    error: None,
                };
            }

            // Load from file
            match fs::read_to_string(&file_path) {
                Ok(contents) => {
                    match serde_json::from_str::<serde_json::Value>(&contents) {
                        Ok(data) => {
                            // Cache the result (thread-safe)
                            cache.set(cache_key, data.clone());

                            BatchDictionaryResult {
                                dictionary_id: dictionary_id.clone(),
                                success: true,
                                data: Some(data),
                                error: None,
                            }
                        }
                        Err(e) => BatchDictionaryResult {
                            dictionary_id: dictionary_id.clone(),
                            success: false,
                            data: None,
                            error: Some(format!("JSON parse error: {}", e)),
                        },
                    }
                }
                Err(e) if e.kind() == std::io::ErrorKind::NotFound => {
                    BatchDictionaryResult {
                        dictionary_id: dictionary_id.clone(),
                        success: false,
                        data: None,
                        error: Some("File not found".to_string()),
                    }
                }
                Err(e) => BatchDictionaryResult {
                    dictionary_id: dictionary_id.clone(),
                    success: false,
                    data: None,
                    error: Some(e.to_string()),
                },
            }
        })
        .collect();

    let successful = results.iter().filter(|r| r.success).count();
    let failed = results.len() - successful;

    Ok(BatchDictionaryResponse {
        total: results.len(),
        successful,
        failed,
        results,
    })
}

#[tauri::command]
pub async fn rename_proper_nouns_dictionary(
    app_handle: tauri::AppHandle,
    cache: State<'_, DictionaryCache>,
    old_dictionary_id: String,
    new_dictionary_id: String,
) -> Result<DictionaryResponse, String> {
    // SECURITY: Validate both dictionary IDs to prevent path traversal
    validate_dictionary_id(&old_dictionary_id)?;
    validate_dictionary_id(&new_dictionary_id)?;

    let dictionary_path = get_dictionary_path(&app_handle)?;

    // Validate dictionary IDs
    if old_dictionary_id == "properNouns" {
        return Ok(DictionaryResponse {
            success: false,
            data: None,
            error: Some("Cannot rename the default 'properNouns' dictionary".to_string()),
            dictionaries: None,
            message: None,
        });
    }

    if !old_dictionary_id.starts_with("properNouns-") || !new_dictionary_id.starts_with("properNouns-") {
        return Ok(DictionaryResponse {
            success: false,
            data: None,
            error: Some("Both dictionary IDs must start with 'properNouns-'".to_string()),
            dictionaries: None,
            message: None,
        });
    }

    let old_file_path = dictionary_path.join(format!("{}.json", old_dictionary_id));
    let new_file_path = dictionary_path.join(format!("{}.json", new_dictionary_id));

    // Check old file exists
    if !old_file_path.exists() {
        return Ok(DictionaryResponse {
            success: false,
            data: None,
            error: Some(format!("Dictionary '{}' not found", old_dictionary_id)),
            dictionaries: None,
            message: None,
        });
    }

    // Check new file doesn't exist
    if new_file_path.exists() {
        return Ok(DictionaryResponse {
            success: false,
            data: None,
            error: Some(format!("Dictionary '{}' already exists", new_dictionary_id)),
            dictionaries: None,
            message: None,
        });
    }

    // Rename the file
    fs::rename(&old_file_path, &new_file_path).map_err(|e| e.to_string())?;

    // Invalidate cache for old dictionary
    cache.invalidate(Some(&old_dictionary_id));

    // Update config.json to replace old name with new name
    let app_data_dir = app_handle.path().app_data_dir().map_err(|e| e.to_string())?;
    let config_path = app_data_dir.join("config.json");

    if config_path.exists() {
        match fs::read_to_string(&config_path) {
            Ok(contents) => {
                if let Ok(mut config) = serde_json::from_str::<serde_json::Value>(&contents) {
                    // Update activeProperNouns array
                    if let Some(active) = config.get_mut("activeProperNouns") {
                        if let Some(active_array) = active.as_array_mut() {
                            for item in active_array.iter_mut() {
                                if let Some(dict_name) = item.as_str() {
                                    if dict_name == old_dictionary_id {
                                        *item = serde_json::Value::String(new_dictionary_id.clone());
                                    }
                                }
                            }
                        }
                    }

                    // Update lastSelectedDictionary if it matches
                    if let Some(last_selected) = config.get_mut("lastSelectedDictionary") {
                        if let Some(dict_name) = last_selected.as_str() {
                            if dict_name == old_dictionary_id {
                                *last_selected = serde_json::Value::String(new_dictionary_id.clone());
                            }
                        }
                    }

                    // Save updated config
                    let json_string = serde_json::to_string_pretty(&config).map_err(|e| e.to_string())?;
                    fs::write(&config_path, json_string).map_err(|e| e.to_string())?;
                }
            }
            Err(_) => {
                // If config doesn't exist or can't be read, continue anyway
            }
        }
    }

    Ok(DictionaryResponse {
        success: true,
        data: None,
        error: None,
        dictionaries: None,
        message: Some(format!("Renamed '{}' to '{}'", old_dictionary_id, new_dictionary_id)),
    })
}

// ============================================================================
// Lookup Index Builder - High-Performance Dictionary Index
// ============================================================================

/// Dictionary entry from JavaScript
#[derive(Deserialize, Serialize, Debug, Clone)]
pub struct DictionaryEntry {
    pub chinese: String,
    pub vietnamese: String,
    pub metadata: Option<String>,
}

/// Dictionary data from JavaScript
#[derive(Deserialize, Serialize, Debug)]
pub struct DictionaryData {
    pub name: String,
    pub entries: Vec<DictionaryEntry>,
    pub priority: Option<u32>,
}

/// Options for building lookup index
#[derive(Deserialize, Serialize, Debug)]
#[serde(rename_all = "camelCase")]
pub struct LookupIndexOptions {
    pub min_text_length: Option<usize>,
    pub enable_indexing: Option<bool>,
    pub use_parallel: Option<bool>,
}

/// Response from lookup index builder
#[derive(Serialize, Deserialize, Debug)]
#[serde(rename_all = "camelCase")]
pub struct LookupIndexResponse {
    pub success: bool,
    pub index: HashMap<u32, CategorizedMatches>,
    pub build_time_ms: u128,
    pub positions_indexed: usize,
    pub index_size: usize,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub error: Option<String>,
}

/// Build a trie from dictionary entries
fn build_trie_from_entries(entries: &[DictionaryEntry]) -> TrieNode {
    let mut trie = TrieNode::new();

    for entry in entries {
        let mut current = &mut trie;

        // Navigate/create path for this word
        for ch in entry.chinese.chars() {
            current = current
                .children
                .entry(ch)
                .or_insert_with(TrieNode::new);
        }

        // Mark end of word and store translation
        current.is_end_of_word = true;
        current.translation = Some(entry.vietnamese.clone());
        current.metadata = entry.metadata.clone();
    }

    trie
}

/// Build comprehensive lookup index for text using Rust + Rayon
///
/// This is a high-performance replacement for the JavaScript buildComprehensiveLookupIndex
/// Expected speedup: 6-50x (200-800ms vs 5-10 seconds for 10KB text)
#[tauri::command]
pub async fn build_lookup_index(
    limiters: State<'_, RateLimiters>,
    text: String,
    dictionaries: Vec<DictionaryData>,
    dictionary_order: Vec<String>,
    options: Option<LookupIndexOptions>,
) -> Result<LookupIndexResponse, String> {
    // SECURITY: Rate limit to prevent abuse
    limiters.check_build_index()?;

    // SECURITY: Validate text size to prevent DoS
    if text.len() > MAX_TEXT_SIZE_BYTES {
        return Err(format!(
            "Text too large: {} MB (max: {} MB)",
            text.len() / 1024 / 1024,
            MAX_TEXT_SIZE_BYTES / 1024 / 1024
        ));
    }

    let start_time = Instant::now();

    // Parse options with defaults
    let opts = options.unwrap_or(LookupIndexOptions {
        min_text_length: Some(50),
        enable_indexing: Some(true),
        use_parallel: Some(true),
    });

    let build_options = IndexBuildOptions {
        min_text_length: opts.min_text_length.unwrap_or(50),
        enable_indexing: opts.enable_indexing.unwrap_or(true),
        use_parallel: opts.use_parallel.unwrap_or(true),
    };

    // Check if indexing should be skipped (use character count, not byte length)
    let text_char_count = text.chars().count();
    if text_char_count < build_options.min_text_length || !build_options.enable_indexing {
        return Ok(LookupIndexResponse {
            success: false,  // Indicate that indexing was skipped
            index: HashMap::new(),
            build_time_ms: start_time.elapsed().as_millis(),
            positions_indexed: 0,
            index_size: 0,
            error: Some(format!(
                "Text too short ({} chars < {} min) or indexing disabled",
                text_char_count, build_options.min_text_length
            )),
        });
    }

    // Convert JavaScript dictionaries to Rust Dictionary format
    let rust_dictionaries: Vec<Dictionary> = dictionaries
        .iter()
        .enumerate()
        .map(|(idx, dict_data)| {
            let trie = build_trie_from_entries(&dict_data.entries);
            let dict_type = DictionaryType::from_name(&dict_data.name);
            let priority = dict_data.priority.unwrap_or(idx as u32);

            Dictionary {
                name: dict_data.name.clone(),
                trie: Arc::new(trie),
                priority,
                dict_type,
            }
        })
        .collect();

    // Build the index (returns hashbrown::HashMap)
    let hashbrown_index = build_comprehensive_lookup_index(
        &text,
        &rust_dictionaries,
        &dictionary_order,
        &build_options,
    );

    let build_time = start_time.elapsed().as_millis();
    let positions_indexed = hashbrown_index.len();
    let index_size = hashbrown_index.values().map(|cat| {
        cat.patterns.len() + cat.proper_nouns.len() + cat.phrases.len() +
        cat.characters.len() + cat.numbers.len()
    }).sum();

    // Convert hashbrown::HashMap to std::collections::HashMap for serde compatibility
    let index: HashMap<u32, CategorizedMatches> = hashbrown_index.into_iter().collect();

    Ok(LookupIndexResponse {
        success: true,
        index,
        build_time_ms: build_time,
        positions_indexed,
        index_size,
        error: None,
    })
}

// ============================================================================
// CODE REVIEW FIX (2026-01-30): Dictionary Cache Health Monitoring
// ============================================================================

#[derive(Serialize)]
pub struct CacheHealthResponse {
    success: bool,
    is_healthy: bool,
    mutex_poisoned: bool,
    poisoning_event_count: u64,
    message: Option<String>,
}

/// CODE REVIEW FIX (2026-01-30): Check dictionary cache health status
///
/// Monitors mutex poisoning events to detect cache corruption.
/// Frontend can call this periodically or when dictionary operations behave unexpectedly.
/// If poisoning is detected, frontend should notify user and suggest application restart.
#[tauri::command]
pub fn check_dictionary_cache_health(app: AppHandle) -> CacheHealthResponse {
    let mutex_poisoned = MUTEX_POISONED.load(Ordering::SeqCst);
    let event_count = POISONING_EVENT_COUNT.load(Ordering::SeqCst);

    // Emit event to frontend if poisoning detected
    if mutex_poisoned {
        let _ = app.emit("dictionary-cache-critical-error", serde_json::json!({
            "type": "mutex_poisoning",
            "event_count": event_count,
            "severity": "critical",
            "message": "Dictionary cache corruption detected. Application restart recommended.",
            "recommendation": "Save your work and restart the application to ensure data integrity."
        }));
    }

    CacheHealthResponse {
        success: true,
        is_healthy: !mutex_poisoned,
        mutex_poisoned,
        poisoning_event_count: event_count,
        message: if mutex_poisoned {
            Some(format!(
                "Dictionary cache has been poisoned {} time(s). Performance degradation expected. Restart recommended.",
                event_count
            ))
        } else {
            None
        },
    }
}
