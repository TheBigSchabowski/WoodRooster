import { useEffect, useState } from 'react';
import { DEFAULT_SETTINGS, DIFFICULTIES, type SrsSettings } from '../srs/scheduler';
import { BOARD_THEMES, DEFAULT_BOARD, LOOKS, isLook, withLook, type BoardPrefs } from '../board/prefs';
import { pieceUri, type PieceColors, type PieceRole, type PieceSide } from '../board/pieces';
import { INKS, normalizeHex, pensFrom, savePen, type PenColor } from '../board/drawing';
import { COMMANDS, TAP_COLS_MAX, TAP_ROWS_MAX, commandAt, commandOf, withGrid, zoneLabel } from '../tapzones';

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
  // Blind laesst sich auch hier per Doppeltippen umschalten; das soll beim
  // Speichern nicht wieder ueberschrieben werden.
  useEffect(() => setB((prev) => ({ ...prev, blind: board.blind })), [board.blind]);
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
            Neue Puzzle am Tag (je Eröffnung) <b>{s.newPerDay}</b>
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
        <h2>Brett und Figuren</h2>
        <p className="muted small">Vorlagen setzen Felder und Figuren zusammen.</p>
        <div className="chips">
          {LOOKS.map((l) => (
            <button
              key={l.label}
              className={`chip ${isLook(b, l) ? 'on' : ''}`}
              onClick={() => setB((prev) => withLook(prev, l))}
            >
              <span className="swatch" style={{ background: l.light }} />
              <span className="swatch" style={{ background: l.dark }} />
              {l.label}
            </button>
          ))}
        </div>

        <div className="colors">
          <div className="color-rows">
            <ColorRow label="Helle Felder" value={b.light} onChange={(v) => changeBoard('light', v)} />
            <ColorRow label="Dunkle Felder" value={b.dark} onChange={(v) => changeBoard('dark', v)} />
            <ColorRow label="Weiß: Körper" value={b.whiteFill} onChange={(v) => changeBoard('whiteFill', v)} />
            <ColorRow label="Weiß: Linien" value={b.whiteLine} onChange={(v) => changeBoard('whiteLine', v)} />
            <ColorRow label="Schwarz: Körper" value={b.blackFill} onChange={(v) => changeBoard('blackFill', v)} />
            <ColorRow label="Schwarz: Linien" value={b.blackLine} onChange={(v) => changeBoard('blackLine', v)} />
          </div>
          <PiecePreview b={b} />
        </div>

        <div className="chips">
          <span className="muted small">Nur Felder:</span>
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
        <span className="muted small">
          Als Hexcode, z. B. <kbd>#E6C99B</kbd> oder kurz <kbd>#ec9</kbd>. Bei Schwarz
          bleibt die Kontur in der Körperfarbe, „Linien“ sind die hellen Innenlinien.
          Gilt erst nach „Speichern“.
        </span>
        <div className="actions">
          <button
            className="ghost"
            disabled={isLook(b, LOOKS[0])}
            onClick={() => setB((prev) => withLook(prev, LOOKS[0]))}
          >
            Standard wiederherstellen
          </button>
        </div>
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
        <h2>Doppeltippen</h2>
        <label className="check">
          <input
            type="checkbox"
            checked={b.tapZonesOn}
            onChange={(e) => changeBoard('tapZonesOn', e.target.checked)}
          />
          Zweimal auf eine freie Stelle tippen führt einen Befehl aus
        </label>
        {b.tapZonesOn && (
          <>
            <div className="steppers">
              <Stepper
                label="Spalten"
                value={b.tapCols}
                min={1}
                max={TAP_COLS_MAX}
                onChange={(n) => setB((prev) => ({ ...prev, ...withGrid(prev, n, prev.tapRows) }))}
              />
              <Stepper
                label="Reihen"
                value={b.tapRows}
                min={1}
                max={TAP_ROWS_MAX}
                onChange={(n) => setB((prev) => ({ ...prev, ...withGrid(prev, prev.tapCols, n) }))}
              />
            </div>
            <p className="muted small">
              Der Bildschirm in {b.tapCols * b.tapRows} Kachel
              {b.tapCols * b.tapRows === 1 ? '' : 'n'}, so wie er aufgeteilt ist. Je Kachel
              festlegen, was ein Doppeltipp dort macht. Knöpfe, Textfelder und das Brett
              zählen nicht als freie Stelle – dort bleibt alles wie gewohnt.
            </p>
            <div className="zone-grid" style={{ gridTemplateColumns: `repeat(${b.tapCols}, 1fr)` }}>
              {Array.from({ length: b.tapCols * b.tapRows }, (_, i) => {
                const id = commandAt(b, i);
                return (
                  <label key={i} className={`zone-tile ${id ? 'set' : ''}`}>
                    <span className="muted small">{zoneLabel(i, b.tapCols, b.tapRows)}</span>
                    <b>{id ? commandOf(id)?.short : '—'}</b>
                    <select
                      value={id ?? ''}
                      onChange={(e) =>
                        changeBoard(
                          'tapZones',
                          b.tapZones.map((z, j) => (j === i ? e.target.value : z)),
                        )
                      }
                      aria-label={`Befehl für ${zoneLabel(i, b.tapCols, b.tapRows)}`}
                    >
                      <option value="">Nichts</option>
                      {COMMANDS.map((c) => (
                        <option key={c.id} value={c.id}>
                          {c.label}
                        </option>
                      ))}
                    </select>
                  </label>
                );
              })}
            </div>
          </>
        )}
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

function Stepper(props: { label: string; value: number; min: number; max: number; onChange: (n: number) => void }) {
  return (
    <div className="stepper">
      <span className="muted small">{props.label}</span>
      <div className="stepper-row">
        <button
          onClick={() => props.onChange(props.value - 1)}
          disabled={props.value <= props.min}
          aria-label={`${props.label}: weniger`}
        >
          −
        </button>
        <b>{props.value}</b>
        <button
          onClick={() => props.onChange(props.value + 1)}
          disabled={props.value >= props.max}
          aria-label={`${props.label}: mehr`}
        >
          +
        </button>
      </div>
    </div>
  );
}

const PREVIEW: [PieceRole, PieceSide][] = [
  ['king', 'white'], ['queen', 'black'], ['knight', 'white'],
  ['knight', 'black'], ['queen', 'white'], ['king', 'black'],
];

/** Sechs Figuren auf abwechselnden Feldern, in den noch nicht gespeicherten Farben. */
function PiecePreview({ b }: { b: BoardPrefs & PieceColors }) {
  return (
    <div className="piece-preview" aria-hidden>
      {PREVIEW.map(([role, side], i) => {
        const light = (Math.floor(i / 3) + i) % 2 === 0;
        return (
          <span key={i} style={{ background: light ? b.light : b.dark }}>
            <img src={pieceUri(role, side, b)} alt="" />
          </span>
        );
      })}
    </div>
  );
}
