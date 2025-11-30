use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::fs;
use std::path::PathBuf;
use std::sync::Mutex;
use tauri::{Manager, State};

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

    pub fn get(&self, key: &str) -> Option<serde_json::Value> {
        self.cache.lock().unwrap().get(key).cloned()
    }

    pub fn set(&self, key: String, value: serde_json::Value) {
        self.cache.lock().unwrap().insert(key, value);
    }

    pub fn invalidate(&self, dictionary_id: Option<&str>) {
        let mut cache = self.cache.lock().unwrap();
        if let Some(id) = dictionary_id {
            cache.retain(|key, _| !key.starts_with(&format!("{}:", id)));
        } else {
            cache.clear();
        }
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
    let dictionary_path = get_dictionary_path(&app_handle)?;
    fs::create_dir_all(&dictionary_path).map_err(|e| e.to_string())?;

    let file_path = dictionary_path.join(format!("{}.json", dictionary_id));

    // Save the data
    let json_string = serde_json::to_string_pretty(&data).map_err(|e| e.to_string())?;
    fs::write(&file_path, json_string).map_err(|e| e.to_string())?;

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

    // Load from file
    match fs::read_to_string(&file_path) {
        Ok(contents) => {
            let data: serde_json::Value = serde_json::from_str(&contents)
                .map_err(|e| e.to_string())?;

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
