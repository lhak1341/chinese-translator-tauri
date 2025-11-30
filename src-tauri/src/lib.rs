// Dictionary commands module
mod dictionary_commands;

use dictionary_commands::DictionaryCache;
use tauri_plugin_clipboard_manager::ClipboardExt;

// Example greeting command (can be removed later)
#[tauri::command]
fn greet(name: &str) -> String {
    format!("Hello, {}! You've been greeted from Rust!", name)
}

// Clipboard command - read text from clipboard
#[tauri::command]
async fn read_clipboard(app: tauri::AppHandle) -> Result<String, String> {
    app.clipboard()
        .read_text()
        .map_err(|e| e.to_string())
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
        // Register all commands
        .invoke_handler(tauri::generate_handler![
            greet,
            read_clipboard,
            dictionary_commands::open_dictionary_folder,
            dictionary_commands::list_proper_nouns_dictionaries,
            dictionary_commands::create_proper_nouns_dictionary,
            dictionary_commands::save_dictionary,
            dictionary_commands::load_dictionary,
            dictionary_commands::load_dictionaries_parallel,
            dictionary_commands::load_configuration,
            dictionary_commands::save_configuration,
            dictionary_commands::load_appearance_settings,
            dictionary_commands::save_appearance_settings,
            dictionary_commands::export_dictionaries,
            dictionary_commands::import_dictionaries,
            dictionary_commands::reset_dictionaries,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
