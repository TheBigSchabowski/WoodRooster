// Prueft Tastenbelegung und Schwierigkeitsstufen.
//
// Die Richtung von YXCV ist bewusst gegenlaeufig zur Knopfreihenfolge (Y ist
// der beste Ausgang, steht aber auf dem rechten Knopf). Genau so eine
// Festlegung kippt sonst still um.
import { Rating } from 'ts-fsrs';
import {
  GRADE_KEY,
  GRADE_LABEL,
  gradeForKey,
  DIFFICULTIES,
  difficultyBand,
  DEFAULT_SETTINGS,
} from '../src/srs/scheduler.ts';

let fails = 0;
const check = (name, got, want) => {
  const ok = JSON.stringify(got) === JSON.stringify(want);
  if (!ok) fails++;
  console.log(`${ok ? 'ok  ' : 'FEHL'}  ${name}${ok ? '' : `  (${JSON.stringify(got)} statt ${JSON.stringify(want)})`}`);
};

// --- Buchstaben ---
check('y ist Einfach', gradeForKey('y'), Rating.Easy);
check('x ist Gut', gradeForKey('x'), Rating.Good);
check('c ist Schwer', gradeForKey('c'), Rating.Hard);
check('v ist Nochmal', gradeForKey('v'), Rating.Again);
check('Grossbuchstaben zaehlen auch', gradeForKey('Y'), Rating.Easy);

// --- Ziffern folgen weiterhin der Knopfreihenfolge ---
check('1 ist Nochmal', gradeForKey('1'), Rating.Again);
check('4 ist Einfach', gradeForKey('4'), Rating.Easy);

// --- Unbelegtes bleibt unbelegt ---
for (const k of ['b', '5', '0', 'Enter', 'f']) {
  check(`'${k}' loest nichts aus`, gradeForKey(k), undefined);
}

// --- Jede Bewertung hat genau einen Buchstaben, keiner doppelt ---
const letters = Object.values(GRADE_KEY);
check('vier Buchstaben', letters.length, 4);
check('keine Doppelbelegung', new Set(letters).size, 4);

// --- Schwierigkeitsstufen decken den Bereich lueckenlos ab ---
const named = DIFFICULTIES.filter((d) => d.id !== 'all');
for (let i = 1; i < named.length; i++) {
  check(
    `${named[i - 1].label} schliesst an ${named[i].label} an`,
    named[i - 1].max,
    named[i].min,
  );
}
check('Alle ist unbegrenzt', difficultyBand({ ...DEFAULT_SETTINGS, difficulty: 'all' }), [null, null]);
check('Mittel ist 1200 bis 1800', difficultyBand({ ...DEFAULT_SETTINGS, difficulty: 'medium' }), [1200, 1800]);
check(
  'Eigener Bereich nimmt die Zahlen aus den Einstellungen',
  difficultyBand({ ...DEFAULT_SETTINGS, difficulty: 'custom', ratingMin: 900, ratingMax: 1500 }),
  [900, 1500],
);

console.log(`\n${fails === 0 ? 'alle Pruefungen bestanden' : `${fails} fehlgeschlagen`}`);
console.log('\nBewertungsleiste von links nach rechts:');
for (const g of [Rating.Again, Rating.Hard, Rating.Good, Rating.Easy]) {
  console.log(`  ${GRADE_LABEL[g].padEnd(8)} ${GRADE_KEY[g].toUpperCase()}`);
}
process.exit(fails === 0 ? 0 : 1);
