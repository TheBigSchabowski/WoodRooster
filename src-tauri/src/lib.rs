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

/// Die App hiess frueher Schachtrainer und hatte darum ein anderes
/// Datenverzeichnis. Gibt es hier noch keinen Lernstand, dort aber schon, wird
/// er einmalig herueberkopiert. `VACUUM INTO` nimmt dabei auch das, was noch im
/// WAL steht, mit. Auf Android liegt die alte App in einer fremden Sandbox -
/// dort findet sich nichts, und es bleibt beim leeren Start.
fn adopt_old_progress(data_dir: &std::path::Path, db_path: &std::path::Path) {
    if db_path.exists() {
        return;
    }
    let Some(parent) = data_dir.parent() else { return };
    let old = parent
        .join("de.leidenschaftlicheslernen.schachtrainer")
        .join("schachtrainer.sqlite");
    if !old.exists() {
        return;
    }
    let copied = Connection::open(&old)
        .and_then(|c| c.execute("VACUUM INTO ?1", [db_path.to_string_lossy()]).map(|_| ()));
    if let Err(e) = copied {
        // Ein halb geschriebenes Ziel wuerde beim naechsten Start als echter
        // Lernstand gelten.
        let _ = std::fs::remove_file(db_path);
        eprintln!("Alter Lernstand liess sich nicht uebernehmen: {e}");
    }
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
            let db_path = data_dir.join("woodrooster.sqlite");
            adopt_old_progress(&data_dir, &db_path);
            let conn = Connection::open(&db_path)?;
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
        .expect("WoodRooster konnte nicht gestartet werden");
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn alter_lernstand_wird_einmal_uebernommen() {
        let root = std::env::temp_dir().join(format!("woodrooster-test-{}", std::process::id()));
        let old_dir = root.join("de.leidenschaftlicheslernen.schachtrainer");
        let new_dir = root.join("de.leidenschaftlicheslernen.woodrooster");
        std::fs::create_dir_all(&old_dir).unwrap();
        std::fs::create_dir_all(&new_dir).unwrap();
        {
            let old = Connection::open(old_dir.join("schachtrainer.sqlite")).unwrap();
            old.execute_batch("PRAGMA journal_mode=WAL; CREATE TABLE t(x); INSERT INTO t VALUES (42);")
                .unwrap();
        }
        let db = new_dir.join("woodrooster.sqlite");
        adopt_old_progress(&new_dir, &db);
        let x: i64 = Connection::open(&db).unwrap().query_row("SELECT x FROM t", [], |r| r.get(0)).unwrap();
        assert_eq!(x, 42);

        // Ein vorhandener neuer Lernstand wird nie ueberschrieben.
        Connection::open(&db).unwrap().execute("UPDATE t SET x = 7", []).unwrap();
        adopt_old_progress(&new_dir, &db);
        let x: i64 = Connection::open(&db).unwrap().query_row("SELECT x FROM t", [], |r| r.get(0)).unwrap();
        assert_eq!(x, 7);
        std::fs::remove_dir_all(&root).unwrap();
    }
}
