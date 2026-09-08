//! Lesen von `openings.pack`.
//!
//! Aufbau der Datei: Magic "LPZK", Version (u32 LE), Laenge des Index (u32 LE),
//! danach der Index als JSON, danach die zstd-Bloecke. Jede Eroeffnungsfamilie
//! ist ein eigener Block, sodass beim Freischalten nur dieser eine entpackt
//! werden muss statt der gesamten Datei.

use std::collections::HashMap;
use std::fs::File;
use std::io::{Read, Seek, SeekFrom};
use std::path::{Path, PathBuf};

use serde::Deserialize;

const MAGIC: &[u8; 4] = b"LPZK";
const VERSION: u32 = 1;

#[derive(Debug, Clone, Deserialize)]
pub struct BlockInfo {
    pub offset: u64,
    pub clen: u64,
    #[allow(dead_code)]
    pub rlen: u64,
    pub count: u64,
}

pub struct Pack {
    path: PathBuf,
    index: HashMap<String, BlockInfo>,
}

/// Eine Puzzlezeile, wie sie im Block steht.
pub struct PuzzleRow {
    pub id: String,
    pub fen: String,
    pub moves: String,
    pub rating: i64,
    pub themes: String,
    pub variation: String,
}

impl Pack {
    pub fn open(path: &Path) -> Result<Self, String> {
        let mut file = File::open(path)
            .map_err(|e| format!("openings.pack nicht lesbar ({e}). Erzeugen mit: npm run build-pack"))?;

        let mut header = [0u8; 12];
        file.read_exact(&mut header)
            .map_err(|e| format!("Kopf von openings.pack unlesbar: {e}"))?;

        if &header[0..4] != MAGIC {
            return Err("openings.pack hat kein gueltiges Format".into());
        }
        let version = u32::from_le_bytes(header[4..8].try_into().unwrap());
        if version != VERSION {
            return Err(format!(
                "openings.pack hat Version {version}, erwartet wird {VERSION}. Neu erzeugen mit: npm run build-pack"
            ));
        }

        let index_len = u32::from_le_bytes(header[8..12].try_into().unwrap()) as usize;
        let mut buf = vec![0u8; index_len];
        file.read_exact(&mut buf)
            .map_err(|e| format!("Index von openings.pack unlesbar: {e}"))?;

        let index: HashMap<String, BlockInfo> = serde_json::from_slice(&buf)
            .map_err(|e| format!("Index von openings.pack nicht auswertbar: {e}"))?;

        Ok(Pack { path: path.to_path_buf(), index })
    }

    pub fn has_family(&self, family: &str) -> bool {
        self.index.contains_key(family)
    }

    /// Entpackt genau einen Familienblock. Alles andere in der Datei wird nicht angefasst.
    pub fn read_family(&self, family: &str) -> Result<Vec<PuzzleRow>, String> {
        let block = self
            .index
            .get(family)
            .ok_or_else(|| format!("Eroeffnungsfamilie '{family}' ist nicht im Pack enthalten"))?;

        let mut file = File::open(&self.path).map_err(|e| format!("openings.pack nicht lesbar: {e}"))?;
        file.seek(SeekFrom::Start(block.offset))
            .map_err(|e| format!("Sprung in openings.pack fehlgeschlagen: {e}"))?;

        let mut packed = vec![0u8; block.clen as usize];
        file.read_exact(&mut packed)
            .map_err(|e| format!("Block '{family}' unvollstaendig: {e}"))?;

        let raw = zstd::decode_all(&packed[..])
            .map_err(|e| format!("Block '{family}' nicht entpackbar: {e}"))?;
        let text = String::from_utf8(raw)
            .map_err(|_| format!("Block '{family}' ist kein gueltiges UTF-8"))?;

        let mut rows = Vec::with_capacity(block.count as usize);
        for line in text.lines() {
            if line.is_empty() {
                continue;
            }
            // id,fen,moves,rating,themes,variantensuffix
            let mut it = line.splitn(6, ',');
            let (Some(id), Some(fen), Some(moves), Some(rating), Some(themes), Some(suffix)) =
                (it.next(), it.next(), it.next(), it.next(), it.next(), it.next())
            else {
                continue;
            };
            let Ok(rating) = rating.parse::<i64>() else { continue };

            // Der Block kennt seine Familie, gespeichert wird nur das Suffix.
            let variation = if suffix.is_empty() {
                family.to_string()
            } else {
                format!("{family}{suffix}")
            };

            rows.push(PuzzleRow {
                id: id.to_string(),
                fen: fen.to_string(),
                moves: moves.to_string(),
                rating,
                themes: themes.to_string(),
                variation,
            });
        }
        Ok(rows)
    }
}
