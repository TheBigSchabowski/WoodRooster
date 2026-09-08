mod commands;
mod db;
mod pack;

use std::collections::HashMap;
use std::sync::Mutex;

use rusqlite::Connection;
use tauri::Manager;

use commands::{AppState, CatalogEntry};
use pack::Pack;

/// Sucht eine mitgelieferte Ressource. Je nach Plattform legt Tauri sie mit
/// oder ohne das `resources/`-Praefix ab, deshalb beide Varianten pruefen.
fn resource(dir: &std::path::Path, name: &str) -> std::path::PathBuf {
    let with_prefix = dir.join("resources").join(name);
    if with_prefix.exists() {
        with_prefix
    } else {
        dir.join(name)
    }
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .setup(|app| {
            let res_dir = app.path().resource_dir()?;

            let pack = Pack::open(&resource(&res_dir, "openings.pack"))?;

            let catalog_raw = std::fs::read(resource(&res_dir, "openings.json")).map_err(|e| {
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
