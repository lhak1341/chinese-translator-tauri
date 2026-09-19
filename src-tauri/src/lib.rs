// Dictionary commands module
mod book_commands;
mod chapter_outline_commands;
mod dictionary_commands;
pub mod book_loader;
pub mod chapter_outline;
pub mod lookup_index_engine;

use book_commands::BookCache;
use dictionary_commands::{DictionaryCache, RateLimiters, TrieCache};
use tauri_plugin_clipboard_manager::ClipboardExt;

// Clipboard command - read text from clipboard
#[tauri::command]
async fn read_clipboard(app: tauri::AppHandle) -> Result<String, String> {
    app.clipboard()
        .read_text()
        .map_err(|_| "Failed to read clipboard".to_string())
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        // Initialize plugins
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_shell::init())
        .plugin(tauri_plugin_clipboard_manager::init())
        // Manage dictionary cache state
        .manage(DictionaryCache::new())
        // PERFORMANCE: Manage trie cache for build_lookup_index (see dictionary_commands.rs)
        .manage(TrieCache::new())
        // SECURITY: Manage rate limiters for DoS prevention
        .manage(RateLimiters::new())
        // Reader: one decoded book at a time (see book_commands.rs)
        .manage(BookCache::new())
        // CODE REVIEW FIX (CRITICAL-2): Setup hook to initialize AppHandle for event emission
        .setup(|app| {
            dictionary_commands::init_app_handle(app.handle().clone());
            Ok(())
        })
        // Register all commands
        .invoke_handler(tauri::generate_handler![
            read_clipboard,
            dictionary_commands::open_dictionary_folder,
            dictionary_commands::list_proper_nouns_dictionaries,
            dictionary_commands::list_fiction_pattern_dictionaries,
            dictionary_commands::create_proper_nouns_dictionary,
            dictionary_commands::create_structural_patterns_dictionary,
            dictionary_commands::create_fiction_dictionary_pair,
            dictionary_commands::rename_proper_nouns_dictionary,
            dictionary_commands::rename_structural_patterns_dictionary,
            dictionary_commands::save_dictionary,
            dictionary_commands::load_dictionary,
            dictionary_commands::load_dictionaries_parallel,
            dictionary_commands::load_configuration,
            dictionary_commands::save_configuration,
            dictionary_commands::load_appearance_settings,
            dictionary_commands::save_appearance_settings,
            dictionary_commands::load_transform_rules,
            dictionary_commands::save_transform_rules,
            dictionary_commands::load_book_records,
            dictionary_commands::save_book_records,
            dictionary_commands::export_dictionaries,
            dictionary_commands::import_dictionaries,
            dictionary_commands::reset_dictionaries,
            dictionary_commands::build_lookup_index,
            dictionary_commands::check_dictionary_cache_health,
            book_commands::scan_library,
            book_commands::open_book,
            book_commands::read_book_lines,
            book_commands::close_book,
            book_commands::fingerprint_book,
            chapter_outline_commands::detect_chapter_outline,
            chapter_outline_commands::chapter_headers_for_pattern,
        ])
        .run(tauri::generate_context!())
        .expect("Failed to start Chinese-Vietnamese Translator. Please check your system configuration and try again. If the problem persists, please report it at: https://github.com/lhak1341/chinese-translator-tauri/issues");
}
