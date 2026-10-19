//! Die Schnittstelle zum Frontend.
//!
//! Arbeitsteilung: FSRS rechnet im Frontend (ts-fsrs liefert dort die vier
//! Intervalle fuer die Bewertungsleiste), Rust haelt die Daten und den Pack.

use std::collections::HashMap;
use std::sync::Mutex;

use rusqlite::{params, Connection};
use serde::{Deserialize, Serialize};
use tauri::State;

use crate::db;
use crate::pack::Pack;

pub struct AppState {
    pub conn: Mutex<Connection>,
    pub pack: Pack,
    pub catalog: Vec<CatalogEntry>,
    pub by_slug: HashMap<String, usize>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CatalogEntry {
    pub slug: String,
    pub family: String,
    pub count: u64,
    #[serde(rename = "isFamily")]
    pub is_family: bool,
}

/// Pseudo-Slug des Favoritenordners. Ein echter Eroeffnungs-Slug enthaelt nie
/// ein '@', die Verwechslungsgefahr ist damit ausgeschlossen.
pub const FAVORITES: &str = "@favorites";

/// Womit eine Sitzung ihre Puzzle auswaehlt: entweder eine Eroeffnung oder der
/// Favoritenordner.
fn scope_predicate(slug: &str) -> &'static str {
    if slug == FAVORITES {
        "p.id IN (SELECT puzzle_id FROM favorite)"
    } else {
        "(p.variation = :slug OR p.family = :slug)"
    }
}

/// Bindet nur die Parameter, die im SQL tatsaechlich vorkommen - rusqlite
/// lehnt unbekannte Namen sonst mit `InvalidParameterName` ab. Je nach Modus
/// und Bereich fallen ":now" und ":slug" weg.
fn used_binds<'a>(
    sql: &str,
    candidates: Vec<(&'a str, &'a dyn rusqlite::ToSql)>,
) -> Vec<(&'a str, &'a dyn rusqlite::ToSql)> {
    candidates.into_iter().filter(|(name, _)| sql.contains(name)).collect()
}

/// Aus `Queens_Gambit_Accepted` wird `Queens Gambit Accepted`.
pub fn display_name(slug: &str) -> String {
    slug.replace('_', " ")
}

#[derive(Serialize)]
pub struct CatalogHit {
    pub slug: String,
    pub name: String,
    pub count: u64,
    pub is_family: bool,
    pub active: bool,
}

#[derive(Serialize)]
pub struct Resolved {
    pub hit: CatalogHit,
    /// Eroeffnungen, deren Slug auf dem gefundenen aufbaut. Lichess fuehrt etwa
    /// `Rapport-Jobava_System_with_e6` als eigene Familie - ohne diesen Hinweis
    /// wuerde man 495 Puzzle stillschweigend verpassen.
    pub related: Vec<CatalogHit>,
}

fn is_active(conn: &Connection, slug: &str) -> bool {
    conn.query_row("SELECT 1 FROM opening WHERE slug = ?1", [slug], |_| Ok(()))
        .is_ok()
}

fn to_hit(e: &CatalogEntry, conn: &Connection) -> CatalogHit {
    CatalogHit {
        slug: e.slug.clone(),
        name: display_name(&e.slug),
        count: e.count,
        is_family: e.is_family,
        active: is_active(conn, &e.slug),
    }
}

// ---------------------------------------------------------------- Katalog

#[tauri::command]
pub fn catalog_search(state: State<AppState>, query: String, limit: usize) -> Vec<CatalogHit> {
    let conn = state.conn.lock().unwrap();
    let needle = query.trim().to_lowercase().replace(' ', "_");
    if needle.is_empty() {
        return state
            .catalog
            .iter()
            .filter(|e| e.is_family)
            .take(limit)
            .map(|e| to_hit(e, &conn))
            .collect();
    }
    let mut hits: Vec<&CatalogEntry> = state
        .catalog
        .iter()
        .filter(|e| e.slug.to_lowercase().contains(&needle))
        .collect();
    // Treffer am Wortanfang zuerst, dann die haeufigeren.
    hits.sort_by_key(|e| {
        let s = e.slug.to_lowercase();
        (!s.starts_with(&needle), std::cmp::Reverse(e.count))
    });
    hits.into_iter().take(limit).map(|e| to_hit(e, &conn)).collect()
}

/// Nimmt eine Lichess-Trainings-URL oder direkt einen Slug entgegen.
#[tauri::command]
pub fn resolve_opening(state: State<AppState>, input: String) -> Result<Resolved, String> {
    let raw = input.trim();
    if raw.is_empty() {
        return Err("Bitte eine Lichess-URL oder einen Eroeffnungsnamen eingeben.".into());
    }

    // Aus .../training/Slug den Slug herausloesen; sonst die Eingabe selbst nehmen.
    let slug = match raw.rfind("/training/") {
        Some(i) => raw[i + "/training/".len()..]
            .split(['?', '#', '/'])
            .next()
            .unwrap_or("")
            .to_string(),
        None => raw.trim_start_matches('/').to_string(),
    };
    if slug.is_empty() {
        return Err(format!("Aus '{raw}' liess sich keine Eroeffnung herauslesen."));
    }

    let conn = state.conn.lock().unwrap();

    // Erst exakt, dann ohne Ruecksicht auf Gross-/Kleinschreibung.
    let idx = state.by_slug.get(&slug).copied().or_else(|| {
        let lower = slug.to_lowercase();
        state.catalog.iter().position(|e| e.slug.to_lowercase() == lower)
    });

    let Some(idx) = idx else {
        // Bewusst ein Fehler statt eines stillen Rueckfalls: die Lichess-API
        // liefert bei unbekanntem Angle einfach zufaellige Puzzle, was man beim
        // Ueben nicht merkt.
        let hint = state
            .catalog
            .iter()
            .find(|e| e.slug.to_lowercase().contains(&slug.to_lowercase()))
            .map(|e| format!(" Meintest du '{}'?", display_name(&e.slug)))
            .unwrap_or_default();
        return Err(format!("'{slug}' ist keine bekannte Eroeffnung.{hint}"));
    };

    let entry = &state.catalog[idx];
    let prefix = format!("{}_", entry.slug);
    let related: Vec<CatalogHit> = state
        .catalog
        .iter()
        .filter(|e| e.slug != entry.slug && e.slug.starts_with(&prefix) && e.is_family)
        .map(|e| to_hit(e, &conn))
        .collect();

    Ok(Resolved { hit: to_hit(entry, &conn), related })
}

// ------------------------------------------------------------ Freischalten

#[tauri::command]
pub fn activate_opening(state: State<AppState>, slug: String) -> Result<usize, String> {
    let idx = *state
        .by_slug
        .get(&slug)
        .ok_or_else(|| format!("'{slug}' ist keine bekannte Eroeffnung."))?;
    let entry = state.catalog[idx].clone();

    if !state.pack.has_family(&entry.family) {
        return Err(format!("Familie '{}' fehlt im Pack.", entry.family));
    }

    // Nur dieser eine Block wird entpackt, nicht die ganze Datei.
    let rows = state.pack.read_family(&entry.family)?;

    let mut conn = state.conn.lock().unwrap();
    let tx = conn.transaction().map_err(|e| e.to_string())?;
    let mut matched = 0usize;
    {
        let mut stmt = tx
            .prepare(
                "INSERT OR IGNORE INTO puzzle(id, fen, moves, rating, themes, family, variation)
                 VALUES(?1, ?2, ?3, ?4, ?5, ?6, ?7)",
            )
            .map_err(|e| e.to_string())?;
        for r in &rows {
            if !entry.is_family && r.variation != entry.slug {
                continue;
            }
            stmt.execute(params![r.id, r.fen, r.moves, r.rating, r.themes, entry.family, r.variation])
                .map_err(|e| e.to_string())?;
            matched += 1;
        }
    }
    tx.execute(
        "INSERT INTO opening(slug, family, display_name, is_family, added_at, puzzle_count)
         VALUES(?1, ?2, ?3, ?4, ?5, ?6)
         ON CONFLICT(slug) DO UPDATE SET puzzle_count = excluded.puzzle_count",
        params![
            entry.slug,
            entry.family,
            display_name(&entry.slug),
            entry.is_family as i64,
            now_ms(),
            matched as i64
        ],
    )
    .map_err(|e| e.to_string())?;
    tx.commit().map_err(|e| e.to_string())?;

    Ok(matched)
}

#[tauri::command]
pub fn deactivate_opening(state: State<AppState>, slug: String) -> Result<(), String> {
    let conn = state.conn.lock().unwrap();
    conn.execute("DELETE FROM opening WHERE slug = ?1", [&slug])
        .map_err(|e| e.to_string())?;
    // Puzzle, die zu keiner aktiven Eroeffnung mehr gehoeren und keinen
    // Lernfortschritt tragen, wieder wegraeumen. Karten und gemerkte Puzzle
    // bleiben unangetastet - sonst waere der Favoritenordner mit einer
    // entfernten Eroeffnung mit weg.
    conn.execute(
        "DELETE FROM puzzle
          WHERE id NOT IN (SELECT puzzle_id FROM card)
            AND id NOT IN (SELECT puzzle_id FROM favorite)
            AND NOT EXISTS (SELECT 1 FROM opening o
                             WHERE o.slug = puzzle.variation OR o.slug = puzzle.family)",
        [],
    )
    .map_err(|e| e.to_string())?;
    Ok(())
}

// ------------------------------------------------------------- Startseite

#[derive(Serialize)]
pub struct OpeningSummary {
    pub slug: String,
    pub name: String,
    pub total: i64,
    pub new_count: i64,
    pub due_count: i64,
    pub learned: i64,
}

#[tauri::command]
pub fn list_activated(state: State<AppState>) -> Result<Vec<OpeningSummary>, String> {
    let conn = state.conn.lock().unwrap();
    let now = now_ms();
    let mut stmt = conn
        .prepare(
            "SELECT o.slug, o.display_name,
                    (SELECT COUNT(*) FROM puzzle p
                      WHERE p.variation = o.slug OR p.family = o.slug) AS total,
                    (SELECT COUNT(*) FROM puzzle p
                      LEFT JOIN card c ON c.puzzle_id = p.id
                      WHERE (p.variation = o.slug OR p.family = o.slug)
                        AND c.puzzle_id IS NULL) AS new_count,
                    (SELECT COUNT(*) FROM puzzle p
                      JOIN card c ON c.puzzle_id = p.id
                      WHERE (p.variation = o.slug OR p.family = o.slug)
                        AND c.due <= ?1) AS due_count,
                    (SELECT COUNT(*) FROM puzzle p
                      JOIN card c ON c.puzzle_id = p.id
                      WHERE p.variation = o.slug OR p.family = o.slug) AS learned
               FROM opening o
              ORDER BY o.added_at",
        )
        .map_err(|e| e.to_string())?;

    let rows = stmt
        .query_map([now], |r| {
            Ok(OpeningSummary {
                slug: r.get(0)?,
                name: r.get(1)?,
                total: r.get(2)?,
                new_count: r.get(3)?,
                due_count: r.get(4)?,
                learned: r.get(5)?,
            })
        })
        .map_err(|e| e.to_string())?
        .collect::<Result<Vec<_>, _>>()
        .map_err(|e| e.to_string())?;
    Ok(rows)
}

// -------------------------------------------------------------- Sitzungen

#[derive(Serialize)]
pub struct CardDto {
    pub due: i64,
    pub stability: f64,
    pub difficulty: f64,
    pub elapsed_days: f64,
    pub scheduled_days: f64,
    pub learning_steps: i64,
    pub reps: i64,
    pub lapses: i64,
    pub state: i64,
    pub last_review: Option<i64>,
}

#[derive(Serialize)]
pub struct PuzzleDto {
    pub id: String,
    pub fen: String,
    pub moves: String,
    pub rating: i64,
    pub themes: String,
    pub variation: String,
    pub name: String,
    pub favorite: bool,
    pub card: Option<CardDto>,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct BatchFilter {
    pub mode: String, // "new" | "due" | "free"
    pub limit: usize,
    pub rating_min: Option<i64>,
    pub rating_max: Option<i64>,
    pub theme: Option<String>,
}

/// Join, Bedingung und Sortierung je Sitzungsmodus.
fn batch_clauses(mode: &str) -> Result<(&'static str, &'static str, &'static str), String> {
    Ok(match mode {
        "new" => (
            "LEFT JOIN card c ON c.puzzle_id = p.id",
            "AND c.puzzle_id IS NULL",
            "ORDER BY p.rating ASC",
        ),
        "due" => (
            "JOIN card c ON c.puzzle_id = p.id",
            "AND c.due <= :now",
            "ORDER BY c.due ASC",
        ),
        "free" => ("LEFT JOIN card c ON c.puzzle_id = p.id", "", "ORDER BY RANDOM()"),
        other => return Err(format!("Unbekannter Modus '{other}'")),
    })
}

/// Getrennt von `next_batch`, damit die Modi im Test wirklich gegen SQLite
/// laufen koennen statt nur zu kompilieren.
fn query_batch(
    conn: &Connection,
    slug: &str,
    filter: &BatchFilter,
    now: i64,
) -> Result<Vec<PuzzleDto>, String> {
    let (join, cond, order) = batch_clauses(&filter.mode)?;
    let scope = scope_predicate(slug);

    let sql = format!(
        "SELECT p.id, p.fen, p.moves, p.rating, p.themes, p.variation,
                c.due, c.stability, c.difficulty, c.elapsed_days, c.scheduled_days,
                c.learning_steps, c.reps, c.lapses, c.state, c.last_review,
                EXISTS(SELECT 1 FROM favorite f WHERE f.puzzle_id = p.id)
           FROM puzzle p {join}
          WHERE {scope}
            {cond}
            AND (:rmin IS NULL OR p.rating >= :rmin)
            AND (:rmax IS NULL OR p.rating <= :rmax)
            AND (:theme IS NULL OR p.themes LIKE :tlike)
          {order}
          LIMIT :limit"
    );

    let theme_like = filter.theme.as_ref().map(|t| format!("%{t}%"));
    let limit = filter.limit as i64;
    let mut stmt = conn.prepare(&sql).map_err(|e| e.to_string())?;

    let binds = used_binds(
        &sql,
        vec![
            (":slug", &slug),
            (":now", &now),
            (":rmin", &filter.rating_min),
            (":rmax", &filter.rating_max),
            (":theme", &filter.theme),
            (":tlike", &theme_like),
            (":limit", &limit),
        ],
    );

    let rows = stmt
        .query_map(&binds[..], |r| {
            let due: Option<i64> = r.get(6)?;
            let card = match due {
                Some(due) => Some(CardDto {
                    due,
                    stability: r.get(7)?,
                    difficulty: r.get(8)?,
                    elapsed_days: r.get(9)?,
                    scheduled_days: r.get(10)?,
                    learning_steps: r.get(11)?,
                    reps: r.get(12)?,
                    lapses: r.get(13)?,
                    state: r.get(14)?,
                    last_review: r.get(15)?,
                }),
                None => None,
            };
            let variation: String = r.get(5)?;
            Ok(PuzzleDto {
                id: r.get(0)?,
                fen: r.get(1)?,
                moves: r.get(2)?,
                rating: r.get(3)?,
                themes: r.get(4)?,
                name: display_name(&variation),
                variation,
                favorite: r.get(16)?,
                card,
            })
        })
        .map_err(|e| e.to_string())?
        .collect::<Result<Vec<_>, _>>()
        .map_err(|e| e.to_string())?;
    Ok(rows)
}

#[tauri::command]
pub fn next_batch(
    state: State<AppState>,
    slug: String,
    filter: BatchFilter,
) -> Result<Vec<PuzzleDto>, String> {
    let conn = state.conn.lock().unwrap();
    query_batch(&conn, &slug, &filter, now_ms())
}

#[derive(Deserialize)]
pub struct CardIn {
    pub due: i64,
    pub stability: f64,
    pub difficulty: f64,
    pub elapsed_days: f64,
    pub scheduled_days: f64,
    pub learning_steps: i64,
    pub reps: i64,
    pub lapses: i64,
    pub state: i64,
    pub last_review: Option<i64>,
}

// Feldnamen bewusst snake_case wie in ts-fsrs, damit das Frontend die
// ReviewLog-Werte ohne Umbenennen durchreichen kann.
#[derive(Deserialize)]
pub struct ReviewIn {
    pub rating: i64,
    pub state: i64,
    pub due: Option<i64>,
    pub stability: Option<f64>,
    pub difficulty: Option<f64>,
    pub elapsed_days: Option<f64>,
    pub last_elapsed_days: Option<f64>,
    pub scheduled_days: Option<f64>,
    pub reviewed_at: i64,
    pub duration_ms: Option<i64>,
}

#[tauri::command]
pub fn record_review(
    state: State<AppState>,
    puzzle_id: String,
    card: CardIn,
    review: ReviewIn,
) -> Result<(), String> {
    let mut conn = state.conn.lock().unwrap();
    let tx = conn.transaction().map_err(|e| e.to_string())?;
    tx.execute(
        "INSERT INTO card(puzzle_id, due, stability, difficulty, elapsed_days, scheduled_days,
                          learning_steps, reps, lapses, state, last_review)
         VALUES(?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11)
         ON CONFLICT(puzzle_id) DO UPDATE SET
            due = excluded.due, stability = excluded.stability, difficulty = excluded.difficulty,
            elapsed_days = excluded.elapsed_days, scheduled_days = excluded.scheduled_days,
            learning_steps = excluded.learning_steps, reps = excluded.reps,
            lapses = excluded.lapses, state = excluded.state, last_review = excluded.last_review",
        params![
            puzzle_id, card.due, card.stability, card.difficulty, card.elapsed_days,
            card.scheduled_days, card.learning_steps, card.reps, card.lapses, card.state,
            card.last_review
        ],
    )
    .map_err(|e| e.to_string())?;

    tx.execute(
        "INSERT INTO review_log(puzzle_id, rating, state, due, stability, difficulty,
                                elapsed_days, last_elapsed_days, scheduled_days,
                                reviewed_at, duration_ms)
         VALUES(?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11)",
        params![
            puzzle_id, review.rating, review.state, review.due, review.stability,
            review.difficulty, review.elapsed_days, review.last_elapsed_days,
            review.scheduled_days, review.reviewed_at, review.duration_ms
        ],
    )
    .map_err(|e| e.to_string())?;

    tx.commit().map_err(|e| e.to_string())?;
    Ok(())
}

// ---------------------------------------------------------- Zuruecksetzen

#[tauri::command]
pub fn reset_srs(state: State<AppState>, slug: String, scope: String) -> Result<usize, String> {
    let conn = state.conn.lock().unwrap();
    // Das Protokoll bleibt in jedem Fall erhalten - nur der Kartenzustand faellt weg.
    let extra = match scope.as_str() {
        "all" => "",
        "lapsed" => "AND lapses > 0",
        other => return Err(format!("Unbekannter Umfang '{other}'")),
    };
    let scope_sql = scope_predicate(&slug);
    let sql = format!(
        "DELETE FROM card WHERE puzzle_id IN
           (SELECT p.id FROM puzzle p WHERE {scope_sql}) {extra}"
    );
    let binds = used_binds(&sql, vec![(":slug", &slug)]);
    let n = conn.execute(&sql, &binds[..]).map_err(|e| e.to_string())?;
    Ok(n)
}

#[tauri::command]
pub fn reset_puzzles(state: State<AppState>, ids: Vec<String>) -> Result<usize, String> {
    let conn = state.conn.lock().unwrap();
    let mut n = 0;
    for id in ids {
        n += conn
            .execute("DELETE FROM card WHERE puzzle_id = ?1", [&id])
            .map_err(|e| e.to_string())?;
    }
    Ok(n)
}

// ------------------------------------------------------------- Statistik

#[derive(Serialize)]
pub struct Stats {
    pub total: i64,
    pub new_count: i64,
    /// Neue Puzzle innerhalb des eingestellten Rating-Bereichs - das ist die
    /// Zahl, die der "Neu"-Knopf tatsaechlich anbietet.
    pub new_in_band: i64,
    pub learning: i64,
    pub review: i64,
    pub relearning: i64,
    pub due_count: i64,
    pub reviews_today: i64,
    pub lapses: i64,
}

#[tauri::command]
pub fn opening_stats(
    state: State<AppState>,
    slug: String,
    rating_min: Option<i64>,
    rating_max: Option<i64>,
) -> Result<Stats, String> {
    let conn = state.conn.lock().unwrap();
    let now = now_ms();
    let day_start = now - (now % 86_400_000);
    let scope = scope_predicate(&slug);

    let sql = format!(
        "SELECT
           (SELECT COUNT(*) FROM puzzle p WHERE {scope}),
           (SELECT COUNT(*) FROM puzzle p LEFT JOIN card c ON c.puzzle_id = p.id
             WHERE {scope} AND c.puzzle_id IS NULL),
           (SELECT COUNT(*) FROM puzzle p LEFT JOIN card c ON c.puzzle_id = p.id
             WHERE {scope} AND c.puzzle_id IS NULL
               AND (:rmin IS NULL OR p.rating >= :rmin)
               AND (:rmax IS NULL OR p.rating <= :rmax)),
           (SELECT COUNT(*) FROM puzzle p JOIN card c ON c.puzzle_id = p.id
             WHERE {scope} AND c.state = 1),
           (SELECT COUNT(*) FROM puzzle p JOIN card c ON c.puzzle_id = p.id
             WHERE {scope} AND c.state = 2),
           (SELECT COUNT(*) FROM puzzle p JOIN card c ON c.puzzle_id = p.id
             WHERE {scope} AND c.state = 3),
           (SELECT COUNT(*) FROM puzzle p JOIN card c ON c.puzzle_id = p.id
             WHERE {scope} AND c.due <= :now),
           (SELECT COUNT(*) FROM review_log l JOIN puzzle p ON p.id = l.puzzle_id
             WHERE {scope} AND l.reviewed_at >= :day),
           (SELECT COALESCE(SUM(c.lapses), 0) FROM puzzle p JOIN card c ON c.puzzle_id = p.id
             WHERE {scope})"
    );

    let binds = used_binds(
        &sql,
        vec![
            (":slug", &slug),
            (":now", &now),
            (":day", &day_start),
            (":rmin", &rating_min),
            (":rmax", &rating_max),
        ],
    );

    conn.query_row(&sql, &binds[..], |r| {
        Ok(Stats {
            total: r.get(0)?,
            new_count: r.get(1)?,
            new_in_band: r.get(2)?,
            learning: r.get(3)?,
            review: r.get(4)?,
            relearning: r.get(5)?,
            due_count: r.get(6)?,
            reviews_today: r.get(7)?,
            lapses: r.get(8)?,
        })
    })
    .map_err(|e| e.to_string())
}

// --------------------------------------------------------- Favoritenordner

/// Merkt ein Puzzle oder nimmt die Markierung zurueck. Gibt den neuen Zustand
/// zurueck, damit die Oberflaeche das Herz sofort umschalten kann.
#[tauri::command]
pub fn toggle_favorite(state: State<AppState>, puzzle_id: String) -> Result<bool, String> {
    let conn = state.conn.lock().unwrap();
    let removed = conn
        .execute("DELETE FROM favorite WHERE puzzle_id = ?1", [&puzzle_id])
        .map_err(|e| e.to_string())?;
    if removed > 0 {
        return Ok(false);
    }
    conn.execute(
        "INSERT INTO favorite(puzzle_id, added_at) VALUES(?1, ?2)",
        params![puzzle_id, now_ms()],
    )
    .map_err(|e| e.to_string())?;
    Ok(true)
}

/// Kachel des Favoritenordners auf der Startseite; `None`, solange nichts
/// gemerkt ist.
#[tauri::command]
pub fn favorites_summary(state: State<AppState>) -> Result<Option<OpeningSummary>, String> {
    let conn = state.conn.lock().unwrap();
    let now = now_ms();
    conn.query_row(
        "SELECT
           (SELECT COUNT(*) FROM favorite),
           (SELECT COUNT(*) FROM favorite f LEFT JOIN card c ON c.puzzle_id = f.puzzle_id
             WHERE c.puzzle_id IS NULL),
           (SELECT COUNT(*) FROM favorite f JOIN card c ON c.puzzle_id = f.puzzle_id
             WHERE c.due <= ?1),
           (SELECT COUNT(*) FROM favorite f JOIN card c ON c.puzzle_id = f.puzzle_id)",
        [now],
        |r| {
            let total: i64 = r.get(0)?;
            Ok(if total == 0 {
                None
            } else {
                Some(OpeningSummary {
                    slug: FAVORITES.to_string(),
                    name: "Gemerkte Puzzle".to_string(),
                    total,
                    new_count: r.get(1)?,
                    due_count: r.get(2)?,
                    learned: r.get(3)?,
                })
            })
        },
    )
    .map_err(|e| e.to_string())
}

/// Die gemerkten Puzzle zum Durchsehen und einzelnen Entfernen.
#[tauri::command]
pub fn list_favorites(state: State<AppState>, limit: usize) -> Result<Vec<PuzzleDto>, String> {
    let conn = state.conn.lock().unwrap();
    let mut stmt = conn
        .prepare(
            "SELECT p.id, p.fen, p.moves, p.rating, p.themes, p.variation
               FROM favorite f JOIN puzzle p ON p.id = f.puzzle_id
              ORDER BY f.added_at DESC
              LIMIT ?1",
        )
        .map_err(|e| e.to_string())?;
    let rows = stmt
        .query_map([limit as i64], |r| {
            let variation: String = r.get(5)?;
            Ok(PuzzleDto {
                id: r.get(0)?,
                fen: r.get(1)?,
                moves: r.get(2)?,
                rating: r.get(3)?,
                themes: r.get(4)?,
                name: display_name(&variation),
                variation,
                favorite: true,
                card: None,
            })
        })
        .map_err(|e| e.to_string())?
        .collect::<Result<Vec<_>, _>>()
        .map_err(|e| e.to_string())?;
    Ok(rows)
}

#[tauri::command]
pub fn clear_favorites(state: State<AppState>) -> Result<usize, String> {
    let conn = state.conn.lock().unwrap();
    conn.execute("DELETE FROM favorite", []).map_err(|e| e.to_string())
}

// -------------------------------------------------------- Einstellungen

#[tauri::command]
pub fn get_setting(state: State<AppState>, key: String) -> Result<Option<String>, String> {
    let conn = state.conn.lock().unwrap();
    db::get_setting(&conn, &key).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn set_setting(state: State<AppState>, key: String, value: String) -> Result<(), String> {
    let conn = state.conn.lock().unwrap();
    db::set_setting(&conn, &key, &value).map_err(|e| e.to_string())
}

// ------------------------------------------------------------- Lichess

#[derive(Serialize)]
pub struct GameInfo {
    pub game_id: String,
    pub pgn: String,
    pub players: Vec<String>,
    pub url: String,
}

/// Die einzige Stelle, an der die App ins Netz geht: den Partiezusammenhang zu
/// einem Puzzle nachschlagen. Serverseitig, damit CORS im WebView kein Thema ist.
#[tauri::command]
pub async fn fetch_game(puzzle_id: String) -> Result<GameInfo, String> {
    let url = format!("https://lichess.org/api/puzzle/{puzzle_id}");
    let res = reqwest::Client::new()
        .get(&url)
        .header("User-Agent", "WoodRooster/0.1 (privat)")
        .send()
        .await
        .map_err(|e| format!("Lichess nicht erreichbar: {e}"))?;

    if !res.status().is_success() {
        return Err(format!("Lichess antwortete mit {}", res.status()));
    }
    let v: serde_json::Value = res.json().await.map_err(|e| format!("Antwort unlesbar: {e}"))?;
    let game_id = v["game"]["id"].as_str().unwrap_or_default().to_string();
    let players = v["game"]["players"]
        .as_array()
        .map(|a| {
            a.iter()
                .map(|p| {
                    format!(
                        "{} ({})",
                        p["name"].as_str().unwrap_or("?"),
                        p["rating"].as_i64().unwrap_or(0)
                    )
                })
                .collect()
        })
        .unwrap_or_default();

    Ok(GameInfo {
        url: format!("https://lichess.org/{game_id}"),
        pgn: v["game"]["pgn"].as_str().unwrap_or_default().to_string(),
        players,
        game_id,
    })
}

pub fn now_ms() -> i64 {
    std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|d| d.as_millis() as i64)
        .unwrap_or(0)
}

#[cfg(test)]
mod tests {
    use super::*;

    fn test_db() -> Connection {
        let conn = Connection::open_in_memory().unwrap();
        crate::db::init(&conn).unwrap();
        conn.execute_batch(
            "INSERT INTO puzzle(id, fen, moves, rating, themes, family, variation) VALUES
               ('a', 'fen1', 'e2e4 e7e5', 900,  'fork opening',   'Fam', 'Fam_Var'),
               ('b', 'fen2', 'd2d4 d7d5', 1500, 'pin middlegame', 'Fam', 'Fam_Var'),
               ('c', 'fen3', 'g1f3 g8f6', 2600, 'mate endgame',   'Fam', 'Fam_Anders');
             INSERT INTO card(puzzle_id, due, stability, difficulty, elapsed_days,
                              scheduled_days, learning_steps, reps, lapses, state, last_review)
               VALUES('b', 1000, 1.0, 5.0, 0.0, 1.0, 0, 1, 0, 2, 500);
             INSERT INTO favorite(puzzle_id, added_at) VALUES('a', 10), ('c', 20);",
        )
        .unwrap();
        conn
    }

    fn filter(mode: &str) -> BatchFilter {
        BatchFilter {
            mode: mode.into(),
            limit: 10,
            rating_min: None,
            rating_max: None,
            theme: None,
        }
    }

    /// Der Regressionstest zu dem Fehler, der "neu" und "frei" zur Laufzeit
    /// zerlegt hat: ":now" wurde gebunden, obwohl es nur im Faellig-SQL steht.
    #[test]
    fn jeder_modus_bindet_genau_seine_parameter() {
        let conn = test_db();
        for mode in ["new", "due", "free"] {
            let r = query_batch(&conn, "Fam", &filter(mode), 5000);
            assert!(r.is_ok(), "Modus '{mode}' scheiterte: {:?}", r.err());
        }
    }

    #[test]
    fn neu_liefert_nur_unberuehrte_puzzle_nach_rating() {
        let conn = test_db();
        let rows = query_batch(&conn, "Fam", &filter("new"), 5000).unwrap();
        let ids: Vec<&str> = rows.iter().map(|p| p.id.as_str()).collect();
        assert_eq!(ids, vec!["a", "c"], "'b' hat bereits eine Karte");
    }

    #[test]
    fn faellig_richtet_sich_nach_dem_zeitpunkt() {
        let conn = test_db();
        assert_eq!(query_batch(&conn, "Fam", &filter("due"), 5000).unwrap().len(), 1);
        assert_eq!(query_batch(&conn, "Fam", &filter("due"), 500).unwrap().len(), 0);
    }

    #[test]
    fn rating_und_motiv_filtern() {
        let conn = test_db();

        let mut f = filter("free");
        f.rating_min = Some(800);
        f.rating_max = Some(2000);
        assert_eq!(query_batch(&conn, "Fam", &f, 5000).unwrap().len(), 2);

        let mut f = filter("free");
        f.theme = Some("fork".into());
        let rows = query_batch(&conn, "Fam", &f, 5000).unwrap();
        assert_eq!(rows.len(), 1);
        assert_eq!(rows[0].id, "a");
    }

    /// Eine Variante darf nur ihre eigenen Puzzle sehen, die Familie alle.
    #[test]
    fn variante_und_familie_greifen_richtig() {
        let conn = test_db();
        assert_eq!(query_batch(&conn, "Fam_Var", &filter("free"), 5000).unwrap().len(), 2);
        assert_eq!(query_batch(&conn, "Fam", &filter("free"), 5000).unwrap().len(), 3);
    }

    /// Im Favoritenordner faellt ":slug" aus dem SQL, im Modus "neu" und "frei"
    /// zusaetzlich ":now". Beides muss die Bindung ueberstehen.
    #[test]
    fn favoritenordner_bindet_seine_parameter() {
        let conn = test_db();
        for mode in ["new", "due", "free"] {
            let r = query_batch(&conn, FAVORITES, &filter(mode), 5000);
            assert!(r.is_ok(), "Favoriten/'{mode}' scheiterte: {:?}", r.err());
        }
    }

    #[test]
    fn favoritenordner_liefert_nur_gemerktes() {
        let conn = test_db();
        let rows = query_batch(&conn, FAVORITES, &filter("free"), 5000).unwrap();
        let mut ids: Vec<&str> = rows.iter().map(|p| p.id.as_str()).collect();
        ids.sort_unstable();
        assert_eq!(ids, vec!["a", "c"]);
        assert!(rows.iter().all(|p| p.favorite), "Merk-Zustand muss mitkommen");
    }

    #[test]
    fn merk_zustand_steht_auch_in_der_eroeffnung() {
        let conn = test_db();
        let rows = query_batch(&conn, "Fam", &filter("free"), 5000).unwrap();
        let fav: Vec<&str> = rows.iter().filter(|p| p.favorite).map(|p| p.id.as_str()).collect();
        assert_eq!(fav.len(), 2, "'a' und 'c' sind gemerkt, 'b' nicht");
        assert!(!fav.contains(&"b"));
    }

    /// Ein Favorit muss das Entfernen seiner Eroeffnung ueberleben.
    #[test]
    fn aufraeumen_verschont_gemerkte_puzzle() {
        let conn = test_db();
        // 'c' hat keine Karte und gehoert zu keiner aktiven Eroeffnung -
        // ohne den Schutz waere es hier weg.
        conn.execute(
            "DELETE FROM puzzle
              WHERE id NOT IN (SELECT puzzle_id FROM card)
                AND id NOT IN (SELECT puzzle_id FROM favorite)
                AND NOT EXISTS (SELECT 1 FROM opening o
                                 WHERE o.slug = puzzle.variation OR o.slug = puzzle.family)",
            [],
        )
        .unwrap();
        let n: i64 = conn
            .query_row("SELECT COUNT(*) FROM puzzle WHERE id IN ('a','c')", [], |r| r.get(0))
            .unwrap();
        assert_eq!(n, 2, "gemerkte Puzzle duerfen nicht weggeraeumt werden");
    }

    #[test]
    fn unbekannter_modus_wird_abgelehnt() {
        let conn = test_db();
        assert!(query_batch(&conn, "Fam", &filter("bloedsinn"), 0).is_err());
    }

    /// Eine Trainings-URL, ein blanker Slug und Unfug muessen klar
    /// auseinandergehalten werden - die Lichess-API tut das gerade nicht.
    #[test]
    fn urls_werden_zu_slugs() {
        for (input, want) in [
            ("https://lichess.org/training/Trompowsky_Attack", "Trompowsky_Attack"),
            ("https://lichess.org/training/Queens_Gambit_Accepted?x=1", "Queens_Gambit_Accepted"),
            ("/training/Rapport-Jobava_System#a", "Rapport-Jobava_System"),
            ("Trompowsky_Attack", "Trompowsky_Attack"),
        ] {
            let raw = input.trim();
            let slug = match raw.rfind("/training/") {
                Some(i) => raw[i + "/training/".len()..]
                    .split(['?', '#', '/'])
                    .next()
                    .unwrap_or("")
                    .to_string(),
                None => raw.trim_start_matches('/').to_string(),
            };
            assert_eq!(slug, want, "Eingabe: {input}");
        }
    }
}
