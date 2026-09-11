mod commands;
mod db;
mod pack;

use std::collections::HashMap;
use std::sync::Mutex;

use rusqlite::Connection;
use tauri::Manager;

use commands::{AppState, CatalogEntry};
use pack::Pack;

/// Sucht eine mitgelieferte Ressource.
/// Auf Android liegen mitgelieferte Dateien nicht direkt im Host-Dateisystem, sondern werden
/// beim ersten App-Start von Kotlin in das App-Datenverzeichnis (`app_data_dir`/`filesDir`)
/// entpackt. Auf dem Desktop (macOS/Linux/Windows) liegen sie im `resource_dir`.
fn find_resource_file(app: &tauri::App, name: &str) -> Result<std::path::PathBuf, String> {
    fn in_dir(dir: &std::path::Path, name: &str) -> Option<std::path::PathBuf> {
        let with_prefix = dir.join("resources").join(name);
        if with_prefix.exists() {
            return Some(with_prefix);
        }

        let without_prefix = dir.join(name);
        if without_prefix.exists() {
            return Some(without_prefix);
        }

        None
    }

    // Auf Android liefert Tauri `activity.dataDir` zurueck, also den Wurzelordner
    // der App-daten. Kotlin legt die extrahierten Dateien aber standardmaessig
    // unter `filesDir` ab. Deshalb muss zusaetzlich `dataDir/files` geprueft
    // werden - andernfalls sucht Rust in `/data/.../resources`, waehrend die
    // Dateien tatsaechlich in `/data/.../files/resources` liegen.
    if let Ok(data_dir) = app.path().app_data_dir() {
        if let Some(path) = in_dir(&data_dir.join("files"), name) {
            return Ok(path);
        }
        if let Some(path) = in_dir(&data_dir, name) {
            return Ok(path);
        }
    }

    // Auf dem Desktop (macOS/Linux/Windows) liegen die Dateien im Bundle.
    if let Ok(res_dir) = app.path().resource_dir() {
        if let Some(path) = in_dir(&res_dir, name) {
            return Ok(path);
        }
    }

    Err(format!(
        "Ressource '{name}' konnte weder im App-Datenverzeichnis noch im Ressourcenverzeichnis gefunden werden."
    ))
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .setup(|app| {
            let pack_path = find_resource_file(app, "openings.pack")?;
            let pack = Pack::open(&pack_path)?;

            let json_path = find_resource_file(app, "openings.json")?;
            let catalog_raw = std::fs::read(&json_path).map_err(|e| {
                format!("openings.json nicht lesbar ({e}). Erzeugen mit: npm run build-pack")
            })?;
            let catalog: Vec<CatalogEntry> = serde_json::from_slice(&catalog_raw)
                .map_err(|e| format!("openings.json nicht auswertbar: {e}"))?;
            let by_slug: HashMap<String, usize> = catalog
                .iter()
                .enumerate()
                .map(|(i, e)| (e.slug.clone(), i))
                .collect();

            // Der Lernfortschritt liegt im App-Datenverzeichnis und verlaesst
            // das Geraet nie.
            let data_dir = app.path().app_data_dir()?;
            std::fs::create_dir_all(&data_dir)?;
            let conn = Connection::open(data_dir.join("schachtrainer.sqlite"))?;
            db::init(&conn)?;

            app.manage(AppState {
                conn: Mutex::new(conn),
                pack,
                catalog,
                by_slug,
            });
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            commands::catalog_search,
            commands::resolve_opening,
            commands::activate_opening,
            commands::deactivate_opening,
            commands::list_activated,
            commands::next_batch,
            commands::record_review,
            commands::reset_srs,
            commands::reset_puzzles,
            commands::opening_stats,
            commands::toggle_favorite,
            commands::favorites_summary,
            commands::list_favorites,
            commands::clear_favorites,
            commands::get_setting,
            commands::set_setting,
            commands::fetch_game,
        ])
        .run(tauri::generate_context!())
        .expect("Schachtrainer konnte nicht gestartet werden");
}
