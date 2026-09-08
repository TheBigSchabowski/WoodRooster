import { useState } from 'react';
import { DEFAULT_SETTINGS, DIFFICULTIES, type SrsSettings } from '../srs/scheduler';

interface Props {
  settings: SrsSettings;
  onSave: (s: SrsSettings) => void;
  onBack: () => void;
}

export function Settings({ settings, onSave, onBack }: Props) {
  const [s, setS] = useState<SrsSettings>(settings);
  const change = <K extends keyof SrsSettings>(k: K, v: SrsSettings[K]) =>
    setS((prev) => ({ ...prev, [k]: v }));

  return (
    <div className="screen">
      <header className="topbar">
        <button className="ghost" onClick={onBack}>
          ← Zurück
        </button>
        <h1>Einstellungen</h1>
        <span />
      </header>

      <div className="panel">
        <label className="field">
          <span>
            Zielgenauigkeit <b>{Math.round(s.retention * 100)} %</b>
          </span>
          <input
            type="range"
            min={0.7}
            max={0.97}
            step={0.01}
            value={s.retention}
            onChange={(e) => change('retention', Number(e.target.value))}
          />
          <span className="muted small">
            Anteil der Puzzle, die du bei der Wiederholung können sollst. Höher heißt
            häufiger üben, niedriger heißt weniger Aufwand bei mehr Vergessen. 90 % ist
            der übliche Ausgangswert.
          </span>
        </label>

        <label className="field">
          <span>
            Längster Abstand <b>{s.maximumInterval.toLocaleString('de-DE')} Tage</b>
          </span>
          <input
            type="range"
            min={30}
            max={365 * 10}
            step={30}
            value={s.maximumInterval}
            onChange={(e) => change('maximumInterval', Number(e.target.value))}
          />
          <span className="muted small">
            Obergrenze, wie weit ein Puzzle in die Zukunft geschoben werden darf.
          </span>
        </label>

        <label className="field">
          <span>
            Neue Puzzle je Sitzung <b>{s.newPerDay}</b>
          </span>
          <input
            type="range"
            min={5}
            max={100}
            step={5}
            value={s.newPerDay}
            onChange={(e) => change('newPerDay', Number(e.target.value))}
          />
        </label>

        <div className="field">
          <span>Schwierigkeit neuer Puzzle</span>
          <div className="chips">
            {DIFFICULTIES.map((d) => (
              <button
                key={d.id}
                className={`chip ${s.difficulty === d.id ? 'on' : ''}`}
                onClick={() => change('difficulty', d.id)}
              >
                {d.label} <span className="muted">{d.hint}</span>
              </button>
            ))}
            <button
              className={`chip ${s.difficulty === 'custom' ? 'on' : ''}`}
              onClick={() => change('difficulty', 'custom')}
            >
              Eigener Bereich
            </button>
          </div>
          {s.difficulty === 'custom' && (
            <div className="fields">
              <label>
                ab
                <input
                  type="number"
                  min={400}
                  max={3200}
                  step={50}
                  value={s.ratingMin}
                  onChange={(e) => change('ratingMin', Number(e.target.value))}
                />
              </label>
              <label>
                bis
                <input
                  type="number"
                  min={400}
                  max={3200}
                  step={50}
                  value={s.ratingMax}
                  onChange={(e) => change('ratingMax', Number(e.target.value))}
                />
              </label>
            </div>
          )}
          <span className="muted small">
            Neue Puzzle kommen nach Rating aufsteigend. Ohne Vorauswahl begänne jede
            Eröffnung mit hunderten sehr leichten Puzzeln. Fällige Wiederholungen kommen
            unabhängig davon zurück. Die Stufe lässt sich auch direkt auf der
            Eröffnungsseite umschalten.
          </span>
        </div>

        <div className="field">
          <span>Tastenbelegung beim Bewerten</span>
          <div className="keymap">
            <span><kbd>Y</kbd> Einfach</span>
            <span><kbd>X</kbd> Gut</span>
            <span><kbd>C</kbd> Schwer</span>
            <span><kbd>V</kbd> Nochmal</span>
          </div>
          <span className="muted small">
            Die linke Hand liegt auf YXCV, von gut nach schlecht. <kbd>1</kbd> bis{' '}
            <kbd>4</kbd> gehen weiterhin (in der Reihenfolge der Knöpfe), die Leertaste
            steht für Gut und <kbd>F</kbd> merkt das Puzzle.
          </span>
        </div>

        <div className="actions">
          <button onClick={() => onSave(s)}>Speichern</button>
          <button className="ghost" onClick={() => setS(DEFAULT_SETTINGS)}>
            Auf Standard zurücksetzen
          </button>
        </div>
      </div>

      <p className="muted small pad">
        Der gesamte Lernfortschritt liegt in einer SQLite-Datei auf diesem Gerät. Nichts
        davon wird irgendwohin gesendet. Ins Netz geht die App nur, wenn du bei einem
        gelösten Puzzle „Partie ansehen“ antippst.
      </p>
    </div>
  );
}
