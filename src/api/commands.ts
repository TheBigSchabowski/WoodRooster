// Typisierte Huellen um die Rust-Commands. Tauri wandelt snake_case-Argumente
// automatisch nach camelCase, die Command-Namen selbst bleiben snake_case.
import { invoke } from '@tauri-apps/api/core';

/** Pseudo-Slug des Favoritenordners; muss zu FAVORITES in commands.rs passen. */
export const FAVORITES = '@favorites';

export interface CatalogHit {
  slug: string;
  name: string;
  count: number;
  is_family: boolean;
  active: boolean;
}

export interface Resolved {
  hit: CatalogHit;
  related: CatalogHit[];
}

export interface OpeningSummary {
  slug: string;
  name: string;
  total: number;
  new_count: number;
  due_count: number;
  learned: number;
}

/** Feldnamen wie in ts-fsrs, Zeitpunkte als Millisekunden. */
export interface CardDto {
  due: number;
  stability: number;
  difficulty: number;
  elapsed_days: number;
  scheduled_days: number;
  learning_steps: number;
  reps: number;
  lapses: number;
  state: number;
  last_review: number | null;
}

export interface PuzzleDto {
  id: string;
  fen: string;
  moves: string;
  rating: number;
  themes: string;
  variation: string;
  name: string;
  favorite: boolean;
  /** Hat einen eigenen Variantenbaum. */
  has_study: boolean;
  card: CardDto | null;
}

export interface Stats {
  total: number;
  new_count: number;
  new_in_band: number;
  learning: number;
  review: number;
  relearning: number;
  due_count: number;
  reviews_today: number;
  lapses: number;
}

/** mix: erst Fälliges, dann Neues (bis zur Tagesgrenze) - der Normalfall. */
export type SessionMode = 'mix' | 'new' | 'due' | 'free';

/** Wonach eine Sitzung ihre Puzzle einzeln holt; es gibt keinen festen Stapel. */
export interface SessionFilter {
  mode: SessionMode;
  /** Für neue Puzzle (mix/new), in der freien Sitzung für alle. */
  ratingMin?: number | null;
  ratingMax?: number | null;
  theme?: string | null;
  /** Nur mix hält sich daran. */
  newPerDay?: number | null;
}

export interface NextPuzzle {
  puzzle: PuzzleDto | null;
  /** Jetzt fällige Karten außer dem gelieferten Puzzle. */
  due: number;
  /** Neue, die heute noch drankommen; null = keine Grenze. */
  new_left: number | null;
}

export interface ReviewIn {
  rating: number;
  state: number;
  due: number | null;
  stability: number | null;
  difficulty: number | null;
  elapsed_days: number | null;
  last_elapsed_days: number | null;
  scheduled_days: number | null;
  reviewed_at: number;
  duration_ms: number | null;
}

export interface GameInfo {
  game_id: string;
  pgn: string;
  players: string[];
  url: string;
}

export const catalogSearch = (query: string, limit = 40) =>
  invoke<CatalogHit[]>('catalog_search', { query, limit });

export const resolveOpening = (input: string) =>
  invoke<Resolved>('resolve_opening', { input });

export const activateOpening = (slug: string) =>
  invoke<number>('activate_opening', { slug });

export const deactivateOpening = (slug: string) =>
  invoke<void>('deactivate_opening', { slug });

export const listActivated = () => invoke<OpeningSummary[]>('list_activated');

/** Mitternacht in Ortszeit - ab da zählen die neuen Puzzle des Tages. */
function dayStart(): number {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d.getTime();
}

export const nextPuzzle = (slug: string, filter: SessionFilter, exclude: string[]) =>
  invoke<NextPuzzle>('next_puzzle', {
    slug,
    query: {
      mode: filter.mode,
      ratingMin: filter.ratingMin ?? null,
      ratingMax: filter.ratingMax ?? null,
      theme: filter.theme ?? null,
      newPerDay: filter.newPerDay ?? null,
      dayStart: dayStart(),
      exclude,
    },
  });

export const recordReview = (puzzleId: string, card: CardDto, review: ReviewIn) =>
  invoke<void>('record_review', { puzzleId, card, review });

export const resetSrs = (slug: string, scope: 'all' | 'lapsed') =>
  invoke<number>('reset_srs', { slug, scope });

export const resetPuzzles = (ids: string[]) => invoke<number>('reset_puzzles', { ids });

export const openingStats = (
  slug: string,
  ratingMin: number | null,
  ratingMax: number | null,
) => invoke<Stats>('opening_stats', { slug, ratingMin, ratingMax });

export const getSetting = (key: string) => invoke<string | null>('get_setting', { key });

export const setSetting = (key: string, value: string) =>
  invoke<void>('set_setting', { key, value });

export const fetchGame = (puzzleId: string) => invoke<GameInfo>('fetch_game', { puzzleId });

export const toggleFavorite = (puzzleId: string) =>
  invoke<boolean>('toggle_favorite', { puzzleId });

export const favoritesSummary = () => invoke<OpeningSummary | null>('favorites_summary');

export const listFavorites = (limit = 300) => invoke<PuzzleDto[]>('list_favorites', { limit });

export const clearFavorites = () => invoke<number>('clear_favorites');

/** Der gespeicherte Variantenbaum als JSON, null wenn es nur die Loesung gibt. */
export const getStudy = (puzzleId: string) => invoke<string | null>('get_study', { puzzleId });

/** null loescht den Baum. */
export const saveStudy = (puzzleId: string, tree: string | null) =>
  invoke<void>('save_study', { puzzleId, tree });
