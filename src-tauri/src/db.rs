//! SQLite-Schema und Migration.
//!
//! Der gesamte Lernfortschritt liegt hier und verlaesst das Geraet nie.

use rusqlite::Connection;

pub fn init(conn: &Connection) -> rusqlite::Result<()> {
    conn.pragma_update(None, "journal_mode", "WAL")?;
    conn.pragma_update(None, "foreign_keys", "ON")?;

    conn.execute_batch(
        r#"
        CREATE TABLE IF NOT EXISTS opening (
            slug         TEXT PRIMARY KEY,
            family       TEXT NOT NULL,
            display_name TEXT NOT NULL,
            is_family    INTEGER NOT NULL,
            added_at     INTEGER NOT NULL,
            puzzle_count INTEGER NOT NULL
        );

        CREATE TABLE IF NOT EXISTS puzzle (
            id        TEXT PRIMARY KEY,
            fen       TEXT NOT NULL,
            moves     TEXT NOT NULL,
            rating    INTEGER NOT NULL,
            themes    TEXT NOT NULL,
            family    TEXT NOT NULL,
            variation TEXT NOT NULL
        );
        CREATE INDEX IF NOT EXISTS puzzle_by_variation ON puzzle(variation, rating);
        CREATE INDEX IF NOT EXISTS puzzle_by_family    ON puzzle(family, rating);

        -- Eine Karte je Puzzle, nicht je Eroeffnung: sonst entstuenden Doppel,
        -- sobald jemand eine Familie und eine ihrer Varianten aktiviert.
        CREATE TABLE IF NOT EXISTS card (
            puzzle_id      TEXT PRIMARY KEY REFERENCES puzzle(id) ON DELETE CASCADE,
            due            INTEGER NOT NULL,
            stability      REAL    NOT NULL,
            difficulty     REAL    NOT NULL,
            elapsed_days   REAL    NOT NULL,
            scheduled_days REAL    NOT NULL,
            learning_steps INTEGER NOT NULL DEFAULT 0,
            reps           INTEGER NOT NULL,
            lapses         INTEGER NOT NULL,
            state          INTEGER NOT NULL,
            last_review    INTEGER
        );
        CREATE INDEX IF NOT EXISTS card_by_due ON card(due);

        -- Vollstaendiges Protokoll: erlaubt Statistik, Rueckgaengig und ein
        -- spaeteres Neuberechnen der FSRS-Parameter aus der eigenen Historie.
        CREATE TABLE IF NOT EXISTS review_log (
            id             INTEGER PRIMARY KEY AUTOINCREMENT,
            puzzle_id      TEXT    NOT NULL,
            rating         INTEGER NOT NULL,
            state          INTEGER NOT NULL,
            due            INTEGER,
            stability      REAL,
            difficulty     REAL,
            elapsed_days   REAL,
            last_elapsed_days REAL,
            scheduled_days REAL,
            reviewed_at    INTEGER NOT NULL,
            duration_ms    INTEGER
        );
        CREATE INDEX IF NOT EXISTS review_log_by_puzzle ON review_log(puzzle_id, reviewed_at);

        -- Gemerkte Puzzle. Bewusst eine eigene Tabelle statt eines Flags in
        -- `puzzle`: so ueberlebt die Markierung das Entfernen und erneute
        -- Hinzufuegen einer Eroeffnung.
        CREATE TABLE IF NOT EXISTS favorite (
            puzzle_id TEXT PRIMARY KEY REFERENCES puzzle(id) ON DELETE CASCADE,
            added_at  INTEGER NOT NULL
        );
        CREATE INDEX IF NOT EXISTS favorite_by_date ON favorite(added_at DESC);

        -- Variantenbaum eines Puzzles als JSON (Aufbau in src/board/study.ts).
        -- Wie `favorite` eine eigene Tabelle, damit er das Entfernen der
        -- Eroeffnung uebersteht - und auch das Aufheben der Merkung.
        CREATE TABLE IF NOT EXISTS study (
            puzzle_id  TEXT PRIMARY KEY REFERENCES puzzle(id) ON DELETE CASCADE,
            tree       TEXT NOT NULL,
            updated_at INTEGER NOT NULL
        );

        CREATE TABLE IF NOT EXISTS setting (
            key   TEXT PRIMARY KEY,
            value TEXT NOT NULL
        );
        "#,
    )
}

pub fn get_setting(conn: &Connection, key: &str) -> rusqlite::Result<Option<String>> {
    conn.query_row("SELECT value FROM setting WHERE key = ?1", [key], |r| r.get(0))
        .map(Some)
        .or_else(|e| match e {
            rusqlite::Error::QueryReturnedNoRows => Ok(None),
            other => Err(other),
        })
}

pub fn set_setting(conn: &Connection, key: &str, value: &str) -> rusqlite::Result<()> {
    conn.execute(
        "INSERT INTO setting(key, value) VALUES(?1, ?2)
         ON CONFLICT(key) DO UPDATE SET value = excluded.value",
        [key, value],
    )?;
    Ok(())
}
