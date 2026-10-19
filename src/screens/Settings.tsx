import { useEffect, useState, type CSSProperties } from 'react';
import { DEFAULT_SETTINGS, DIFFICULTIES, type SrsSettings } from '../srs/scheduler';
import { BOARD_THEMES, DEFAULT_BOARD, type BoardPrefs } from '../board/prefs';
import { INKS, normalizeHex, pensFrom, savePen, type PenColor } from '../board/drawing';

interface Props {
  settings: SrsSettings;
  board: BoardPrefs;
  onSave: (s: SrsSettings, b: BoardPrefs) => void;
  onBack: () => void;
}

export function Settings({ settings, board, onSave, onBack }: Props) {
  const [s, setS] = useState<SrsSettings>(settings);
  const change = <K extends keyof SrsSettings>(k: K, v: SrsSettings[K]) =>
    setS((prev) => ({ ...prev, [k]: v }));
  const [b, setB] = useState<BoardPrefs>(board);
  const changeBoard = <K extends keyof BoardPrefs>(k: K, v: BoardPrefs[K]) =>
    setB((prev) => ({ ...prev, [k]: v }));
  const pens = pensFrom(b.pens);
  const setPen = (i: number, pen: PenColor) =>
    changeBoard('pens', pens.map((p, j) => savePen(j === i ? pen : p)));
  // Der Stift, auf den ein Klick in die Farbleiste wirkt.
  const [activePen, setActivePen] = useState(0);

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

      </div>

      <div className="panel">
        <h2>Blindmodus</h2>
        <label className="check">
          <input
            type="checkbox"
            checked={b.blind}
            onChange={(e) => changeBoard('blind', e.target.checked)}
          />
          Blind üben
        </label>
        <label className="field">
          <span>
            Stellung sichtbar <b>{formatSeconds(b.blindSeconds)}</b>
          </span>
          <input
            type="range"
            min={10}
            max={600}
            step={10}
            value={b.blindSeconds}
            onChange={(e) => changeBoard('blindSeconds', Number(e.target.value))}
          />
          <span className="muted small">
            So lange ist die Stellung zu sehen, dann klappt das Brett zu. Gezogen wird
            darunter im Zugfeld (<kbd>Sf3</kbd>, <kbd>Nf3</kbd>, <kbd>exd5</kbd>,{' '}
            <kbd>0-0</kbd> oder <kbd>g1f3</kbd>). <kbd>B</kbd> klappt das Brett auf und
            wieder zu. Ein- und ausschalten geht auch oben in der Sitzung.
          </span>
        </label>
      </div>

      <div className="panel">
        <h2>Brettfarben</h2>
        <div className="chips">
          {BOARD_THEMES.map((t) => (
            <button
              key={t.label}
              className={`chip ${b.light === t.light && b.dark === t.dark ? 'on' : ''}`}
              onClick={() => setB((prev) => ({ ...prev, light: t.light, dark: t.dark }))}
            >
              <span className="swatch" style={{ background: t.light }} />
              <span className="swatch" style={{ background: t.dark }} />
              {t.label}
            </button>
          ))}
        </div>
        <div className="colors">
          <div className="color-rows">
            <ColorRow label="Helle Felder" value={b.light} onChange={(v) => changeBoard('light', v)} />
            <ColorRow label="Dunkle Felder" value={b.dark} onChange={(v) => changeBoard('dark', v)} />
          </div>
          <div
            className="mini-board"
            style={{ '--sq-light': b.light, '--sq-dark': b.dark } as CSSProperties}
            aria-hidden
          />
        </div>
        <span className="muted small">
          Als Hexcode, z. B. <kbd>#E6C99B</kbd> oder kurz <kbd>#ec9</kbd>.
        </span>
      </div>

      <div className="panel">
        <h2>Zeichenstifte</h2>
        <p className="muted small">
          Zeichenmodus: dreimal schnell aufs Brett tippen oder <kbd>M</kbd>. Antippen
          kreist ein Feld ein (oder füllt es), Ziehen malt einen Pfeil, Züge sind solange
          gesperrt. Mit der Maus geht es auch ohne Modus über die rechte Taste; Shift,
          Alt oder beide nehmen Stift 2, 3 oder 4. Im Modus: <kbd>1</kbd>–<kbd>6</kbd>{' '}
          Stift, <kbd>O</kbd> Kreis/Feld, <kbd>X</kbd> alles weg, <kbd>U</kbd> oder{' '}
          <kbd>Esc</kbd> beenden. Gezeichnetes wird nicht gespeichert.
        </p>
        <div className="pen-rows">
          {pens.map((p, i) => (
            <div
              key={i}
              className={`pen-row ${activePen === i ? 'on' : ''}`}
              onFocusCapture={() => setActivePen(i)}
              onClick={() => setActivePen(i)}
            >
              <span className="pen-num">{i + 1}</span>
              <ColorRow
                value={p.hex}
                onChange={(hex) =>
                  setPen(i, { hex, label: INKS.find((ink) => ink.hex === hex)?.label ?? hex })
                }
              />
              <input
                className="pen-name"
                value={p.label}
                onChange={(e) => setPen(i, { hex: p.hex, label: e.target.value })}
                aria-label={`Name von Stift ${i + 1}`}
              />
            </div>
          ))}
        </div>
        <div className="ink-palette">
          {INKS.map((ink) => (
            <button
              key={ink.id}
              className="ink"
              style={{ background: ink.hex }}
              title={`${ink.label} ${ink.hex} → Stift ${activePen + 1}`}
              onClick={() => setPen(activePen, { hex: ink.hex, label: ink.label })}
            />
          ))}
        </div>
        <span className="muted small">
          Ein Klick auf eine Farbe gibt sie dem markierten Stift ({activePen + 1}).
        </span>
      </div>

      <div className="panel">
        <div className="actions">
          <button onClick={() => onSave(s, b)}>Speichern</button>
          <button
            className="ghost"
            onClick={() => {
              setS(DEFAULT_SETTINGS);
              setB(DEFAULT_BOARD);
            }}
          >
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

function formatSeconds(sec: number): string {
  const m = Math.floor(sec / 60);
  const r = sec % 60;
  if (m === 0) return `${r} s`;
  return r === 0 ? `${m} min` : `${m} min ${r} s`;
}

/**
 * Farbe waehlen ueber den Farbwaehler oder als Hexcode. Der Code wird erst
 * uebernommen, wenn er gueltig ist; bis dahin bleibt die alte Farbe.
 */
function ColorRow({ label, value, onChange }: { label?: string; value: string; onChange: (hex: string) => void }) {
  const [draft, setDraft] = useState(value);
  useEffect(() => setDraft(value), [value]);
  const valid = normalizeHex(draft) !== null;
  return (
    <label className="color-row">
      {label && <span className="color-label">{label}</span>}
      <input
        type="color"
        value={value.toLowerCase()}
        onChange={(e) => onChange(normalizeHex(e.target.value) ?? value)}
        aria-label={label ? `${label} wählen` : 'Farbe wählen'}
      />
      <input
        className={`hex ${valid ? '' : 'invalid'}`}
        value={draft}
        spellCheck={false}
        autoCapitalize="off"
        autoCorrect="off"
        onChange={(e) => {
          setDraft(e.target.value);
          // Sechsstellig sofort; ein kurzer Code wie "#ec9" erst beim Verlassen,
          // sonst wuerde er mitten im Tippen zu "#EECC99" aufgeblasen.
          if (/^#?[0-9a-f]{6}$/i.test(e.target.value.trim())) onChange(normalizeHex(e.target.value)!);
        }}
        onBlur={() => {
          const hex = normalizeHex(draft);
          if (hex && hex !== value) onChange(hex);
          else setDraft(value);
        }}
        onKeyDown={(e) => {
          if (e.key === 'Enter') (e.target as HTMLInputElement).blur();
        }}
        aria-label={label ? `${label} als Hexcode` : 'Hexcode'}
      />
    </label>
  );
}
