// FSRS lebt bewusst im Frontend: ts-fsrs liefert mit `repeat` alle vier
// Bewertungen samt Folgeintervall auf einmal - genau das, was die
// Bewertungsleiste anzeigen muss. Rust speichert nur das Ergebnis.
import {
  fsrs,
  generatorParameters,
  createEmptyCard,
  Rating,
  type Card,
  type Grade,
  type FSRS,
} from 'ts-fsrs';
import type { CardDto, ReviewIn } from '../api/commands';

export const GRADES: Grade[] = [Rating.Again, Rating.Hard, Rating.Good, Rating.Easy];

export const GRADE_LABEL: Record<number, string> = {
  [Rating.Again]: 'Nochmal',
  [Rating.Hard]: 'Schwer',
  [Rating.Good]: 'Gut',
  [Rating.Easy]: 'Einfach',
};

// Linke Hand auf YXCV: Y ist der beste Ausgang, V der schlechteste. Die
// Knopfreihenfolge bleibt die von Anki gewohnte, deshalb laufen die Buchstaben
// ueber die Leiste von rechts nach links - auf den Knoepfen steht es dran.
//
// Auf der deutschen QWERTZ-Tastatur liegen Y X C V nebeneinander unten links,
// genau dafuer ist die Belegung gedacht. Auf QWERTY steht dort Z X C V.
export const GRADE_KEY: Record<number, string> = {
  [Rating.Easy]: 'y',
  [Rating.Good]: 'x',
  [Rating.Hard]: 'c',
  [Rating.Again]: 'v',
};

/**
 * Buchstabe oder Ziffer zu einer Bewertung; beides bleibt bedienbar.
 *
 * WICHTIG: Hier gehoert `KeyboardEvent.key` hinein, nicht `.code`. `.key` ist
 * das Zeichen, das die Taste im eingestellten Layout erzeugt - auf einer
 * deutschen Tastatur liefert die Taste unten links ein 'y'. `.code` meldet
 * dagegen die physische Position nach US-Layout: dieselbe Taste hiesse dort
 * 'KeyZ', und 'KeyY' waere die Taste neben dem T. Mit `.code` laege "Einfach"
 * also auf der falschen Taste.
 */
export function gradeForKey(key: string): Grade | undefined {
  const lower = key.toLowerCase();
  const byLetter = GRADES.find((g) => GRADE_KEY[g] === lower);
  if (byLetter !== undefined) return byLetter;
  const n = Number(key);
  return n >= 1 && n <= 4 ? GRADES[n - 1] : undefined;
}

export type DifficultyId = 'all' | 'easy' | 'medium' | 'hard' | 'insane' | 'custom';

export interface DifficultyLevel {
  id: DifficultyId;
  label: string;
  hint: string;
  min: number | null;
  max: number | null;
}

/** Die Grenzen orientieren sich an den ueblichen Lichess-Puzzle-Ratings. */
export const DIFFICULTIES: DifficultyLevel[] = [
  { id: 'all', label: 'Alle', hint: 'ohne Einschränkung', min: null, max: null },
  { id: 'easy', label: 'Leicht', hint: 'bis 1200', min: null, max: 1200 },
  { id: 'medium', label: 'Mittel', hint: '1200 bis 1800', min: 1200, max: 1800 },
  { id: 'hard', label: 'Schwer', hint: '1800 bis 2200', min: 1800, max: 2200 },
  { id: 'insane', label: 'Sehr schwer', hint: 'ab 2200', min: 2200, max: null },
];

/** Der Rating-Bereich, der sich aus der gewaehlten Schwierigkeit ergibt. */
export function difficultyBand(s: SrsSettings): [number | null, number | null] {
  if (s.difficulty === 'custom') return [s.ratingMin, s.ratingMax];
  const d = DIFFICULTIES.find((x) => x.id === s.difficulty);
  return d ? [d.min, d.max] : [null, null];
}

export function difficultyLabel(s: SrsSettings): string {
  if (s.difficulty === 'custom') return `${s.ratingMin}–${s.ratingMax}`;
  const d = DIFFICULTIES.find((x) => x.id === s.difficulty);
  return d ? d.label : 'Alle';
}

export interface SrsSettings {
  retention: number;
  maximumInterval: number;
  newPerDay: number;
  /** Gilt nur fuer neue Puzzle - faellige kommen unabhaengig davon zurueck. */
  difficulty: DifficultyId;
  /** Nur bei difficulty === 'custom' massgeblich. */
  ratingMin: number;
  ratingMax: number;
}

export const DEFAULT_SETTINGS: SrsSettings = {
  retention: 0.9,
  maximumInterval: 365 * 5,
  newPerDay: 20,
  // Neue Puzzle laufen nach Rating aufsteigend. Ohne Vorauswahl begaenne jede
  // Eroeffnung mit hunderten Puzzeln unter 800, deshalb startet die App in der
  // Mitte - umstellbar mit einem Klick auf der Eroeffnungsseite.
  difficulty: 'medium',
  ratingMin: 800,
  ratingMax: 2400,
};

export function makeScheduler(s: SrsSettings): FSRS {
  return fsrs(
    generatorParameters({
      request_retention: s.retention,
      maximum_interval: s.maximumInterval,
      enable_fuzz: true,
    }),
  );
}

export function toCard(dto: CardDto | null): Card {
  if (!dto) return createEmptyCard();
  return {
    due: new Date(dto.due),
    stability: dto.stability,
    difficulty: dto.difficulty,
    elapsed_days: dto.elapsed_days,
    scheduled_days: dto.scheduled_days,
    learning_steps: dto.learning_steps,
    reps: dto.reps,
    lapses: dto.lapses,
    state: dto.state,
    last_review: dto.last_review === null ? undefined : new Date(dto.last_review),
  };
}

export function fromCard(card: Card): CardDto {
  return {
    due: card.due.getTime(),
    stability: card.stability,
    difficulty: card.difficulty,
    elapsed_days: card.elapsed_days,
    scheduled_days: card.scheduled_days,
    learning_steps: card.learning_steps,
    reps: card.reps,
    lapses: card.lapses,
    state: card.state,
    last_review: card.last_review ? card.last_review.getTime() : null,
  };
}

export function toReview(log: {
  rating: number;
  state: number;
  due: Date;
  stability: number;
  difficulty: number;
  elapsed_days: number;
  last_elapsed_days: number;
  scheduled_days: number;
}, reviewedAt: number, durationMs: number | null): ReviewIn {
  return {
    rating: log.rating,
    state: log.state,
    due: log.due.getTime(),
    stability: log.stability,
    difficulty: log.difficulty,
    elapsed_days: log.elapsed_days,
    last_elapsed_days: log.last_elapsed_days,
    scheduled_days: log.scheduled_days,
    reviewed_at: reviewedAt,
    duration_ms: durationMs,
  };
}

/** Abstand als kurzer deutscher Text, wie er unter den Bewertungsknoepfen steht. */
export function formatInterval(from: Date, to: Date): string {
  const min = (to.getTime() - from.getTime()) / 60000;
  if (min < 1) return '<1 Min';
  if (min < 60) return `${Math.round(min)} Min`;
  const hours = min / 60;
  if (hours < 24) return `${Math.round(hours)} Std`;
  const days = hours / 24;
  if (days < 31) return `${Math.round(days)} ${Math.round(days) === 1 ? 'Tag' : 'Tage'}`;
  const months = days / 30.44;
  if (months < 12) return `${months.toFixed(months < 10 ? 1 : 0)} Mon`.replace('.', ',');
  return `${(days / 365.25).toFixed(1)} J`.replace('.', ',');
}
