import { useEffect, useRef, useState, type CSSProperties, type PointerEvent as ReactPointerEvent } from 'react';
import { Chessground } from '@lichess-org/chessground';
import type { Api } from '@lichess-org/chessground/api';
import type { Color, Key } from '@lichess-org/chessground/types';

import { toggle, PENS, type Mark, type Pen, type PenColor } from './drawing';

import '@lichess-org/chessground/assets/chessground.base.css';
import '@lichess-org/chessground/assets/chessground.brown.css';
import '@lichess-org/chessground/assets/chessground.cburnett.css';

interface Props {
  fen: string;
  orientation: Color;
  turnColor: Color;
  dests: Map<Key, Key[]>;
  lastMove?: [Key, Key];
  check: boolean;
  movable: boolean;
  hint?: Key;
  /** Zaehlt bei jedem Zugversuch hoch. Noetig, weil ein abgelehnter Zug die FEN
   *  nicht veraendert - ohne diesen Wert bliebe die Figur dort liegen, wohin sie
   *  faelschlich gezogen wurde. */
  revision: number;
  onMove: (orig: Key, dest: Key) => void;
  /** Helle und dunkle Felder, "#RRGGBB". */
  light: string;
  dark: string;
  /** Die sechs Zeichenstifte. */
  pens: PenColor[];
  /** Zugeklappt (Blindmodus): das Brett bleibt bestehen, ist aber nicht zu sehen. */
  collapsed?: boolean;
}

/** Wie schnell aufeinander drei Tipper kommen muessen, um den Zeichenmodus umzuschalten. */
const TAP_GAP_MS = 350;
/** Laenger gehalten ist kein Tipper mehr, sondern ein Kreis, der gezeichnet wurde. */
const TAP_HOLD_MS = 500;

const FILES = 'abcdefgh';

export function PuzzleBoard(props: Props) {
  const host = useRef<HTMLDivElement>(null);
  const api = useRef<Api | null>(null);
  // Ueber ein Ref, damit die Chessground-Instanz beim Neuaufbau nicht auf einen
  // veralteten Handler zeigt.
  const onMove = useRef(props.onMove);
  onMove.current = props.onMove;

  // Gezeichnetes gehoert zur Stellung: ein Zug wischt das Brett sauber.
  const [drawn, setDrawn] = useState<Mark[]>([]);
  const [drawing, setDrawing] = useState<Mark | null>(null);
  const [drawMode, setDrawMode] = useState(false);
  const [pen, setPen] = useState<Pen>({ color: 0, field: false });
  // Drei schnelle Tipper schalten den Zeichenmodus um. Was vor dem ersten
  // gezeichnet war, kommt danach zurueck: die Tipper selbst sollen keine Spur lassen.
  const taps = useRef({ count: 0, lastUp: 0, before: [] as Mark[] });
  // Fuer die Fenster-Listener, die nicht bei jedem Rendern neu gebunden werden.
  const live = useRef({ drawn, drawMode, pen, collapsed: !!props.collapsed });
  live.current = { drawn, drawMode, pen, collapsed: !!props.collapsed };

  useEffect(() => {
    if (!host.current) return;
    const supportsDrag = window.matchMedia('(hover: hover) and (pointer: fine)').matches;

    api.current = Chessground(host.current, {
      fen: props.fen,
      orientation: props.orientation,
      turnColor: props.turnColor,
      coordinates: true,
      // Nur fuer 3D-Figurensaetze gedacht: setzt je Figur ein z-index bis 10 und
      // schiebt sie damit ueber die Koordinaten. Cburnett ist flach.
      addPieceZIndex: false,
      animation: { enabled: true, duration: 200 },
      highlight: { lastMove: true, check: true },
      // Lichess' Analyse-Boards ignorieren Touch-Eingaben neben Figuren nicht;
      // der Chessground-Default (1) ist auf Touchscreens zu unpraegzise.
      touchIgnoreRadius: 0,
      movable: {
        free: false,
        showDests: true,
        events: { after: (orig, dest) => onMove.current(orig, dest) },
      },
      // Auf Touchgeraeten ist Tap-Tap zuverlaessiger als Drag-and-Drop. Mit
      // Maus/Trackpad bleibt Drag aktiv, wie am Desktop gewohnt.
      draggable: { enabled: supportsDrag, showGhost: supportsDrag },
      selectable: { enabled: true },
      premovable: { enabled: false },
      // Gezeichnet wird selbst (siehe unten), damit Maus, Zeichenmodus und
      // frei gewaehlte Stiftfarben ein und dasselbe sind.
      drawable: { enabled: false },
      disableContextMenu: true,
    });
    return () => {
      api.current?.destroy();
      api.current = null;
    };
    // Absichtlich nur einmal: alle weiteren Aenderungen laufen ueber set().
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    api.current?.set({
      fen: props.fen,
      orientation: props.orientation,
      turnColor: props.turnColor,
      lastMove: props.lastMove,
      check: props.check,
      movable: {
        color: props.movable && !drawMode ? props.orientation : undefined,
        dests: props.movable && !drawMode ? props.dests : new Map(),
      },
    });
  }, [
    props.fen,
    props.orientation,
    props.turnColor,
    props.lastMove,
    props.check,
    props.movable,
    props.dests,
    props.revision,
    drawMode,
  ]);

  useEffect(() => {
    api.current?.setAutoShapes(
      props.hint ? [{ orig: props.hint, brush: 'green' }] : [],
    );
  }, [props.hint]);

  // Neue Stellung, sauberes Brett; die Tipper davor zaehlen nicht mehr.
  useEffect(() => {
    setDrawn([]);
    setDrawing(null);
    taps.current.count = 0;
  }, [props.fen]);

  // Ausgefuellte Felder liegen unter den Figuren, deshalb als Feld-Klasse.
  useEffect(() => {
    const custom = new Map<Key, string>();
    for (const m of [...drawn, ...(drawing ? [drawing] : [])]) {
      if (m.field) custom.set(m.from, `pen-field pen-${m.color}`);
    }
    api.current?.set({ highlight: { custom } });
  }, [drawn, drawing]);

  // Nach dem Aufklappen misst Chessground das Brett neu aus.
  useEffect(() => {
    if (props.collapsed) {
      setDrawMode(false);
      return;
    }
    const id = requestAnimationFrame(() => api.current?.redrawAll());
    return () => cancelAnimationFrame(id);
  }, [props.collapsed]);

  /** Das Feld unter einem Punkt auf dem Bildschirm. */
  function keyAt(x: number, y: number): Key | undefined {
    const r = host.current?.getBoundingClientRect();
    if (!r || r.width === 0) return undefined;
    const col = Math.floor(((x - r.left) / r.width) * 8);
    const row = Math.floor(((y - r.top) / r.height) * 8);
    if (col < 0 || col > 7 || row < 0 || row > 7) return undefined;
    const white = props.orientation === 'white';
    return `${FILES[white ? col : 7 - col]}${white ? 8 - row : row + 1}` as Key;
  }

  /** Mitte eines Feldes in Brett-Einheiten (ein Feld = 1). */
  function centre(key: Key): [number, number] {
    const file = FILES.indexOf(key[0]);
    const rank = Number(key[1]) - 1;
    return props.orientation === 'white' ? [file + 0.5, 7 - rank + 0.5] : [7 - file + 0.5, rank + 0.5];
  }

  /**
   * Zaehlt einen schnellen Tipper; der dritte in Folge schaltet den
   * Zeichenmodus um und nimmt zurueck, was die Tipper unterwegs gezeichnet
   * haben. Gibt true zurueck, wenn er das getan hat.
   */
  function tapped(downAt: number, upAt: number, before: Mark[]): boolean {
    const t = taps.current;
    t.count = t.count > 0 && downAt - t.lastUp <= TAP_GAP_MS ? t.count + 1 : 1;
    t.lastUp = upAt;
    if (t.count === 1) t.before = before;
    if (t.count < 3) return false;
    t.count = 0;
    setDrawn(t.before);
    setDrawMode((on) => !on);
    api.current?.selectSquare(null);
    return true;
  }

  /**
   * Zeichnet vom Feld unter `start` aus, bis der Zeiger losgelassen wird:
   * Ziehen malt einen Pfeil, Loslassen auf demselben Feld kreist es ein (oder
   * fuellt es mit dem Feld-Stift). Shift, Alt oder beide nehmen Stift 2, 3
   * oder 4 wie auf lichess.
   */
  function drawFrom(start: PointerEvent | MouseEvent, countTaps: boolean) {
    const from = keyAt(start.clientX, start.clientY);
    if (!from) return;
    const color =
      start.shiftKey && start.altKey ? 3 : start.shiftKey ? 1 : start.altKey ? 2 : live.current.pen.color;
    const field = live.current.pen.field;
    const before = live.current.drawn;
    const downAt = performance.now();
    let to = from;
    const markTo = (k: Key): Mark => ({ from, to: k, color, field: field && k === from });
    setDrawing(markTo(from));

    const move = (e: MouseEvent) => {
      const k = keyAt(e.clientX, e.clientY);
      if (k && k !== to) {
        to = k;
        setDrawing(markTo(k));
      }
    };
    const up = (e: PointerEvent) => {
      // Auch ein Zug ohne Zwischenschritte endet, wo er losgelassen wurde.
      move(e);
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
      window.removeEventListener('pointercancel', up);
      setDrawing(null);
      const mark = markTo(to);
      setDrawn((d) => toggle(d, mark));
      const upAt = performance.now();
      if (countTaps && to === from && upAt - downAt < TAP_HOLD_MS) tapped(downAt, upAt, before);
    };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
    window.addEventListener('pointercancel', up);
  }

  // Ohne Zeichenmodus: rechte Maustaste zeichnet wie auf lichess, ein normaler
  // Tipper wischt das Gezeichnete weg und zaehlt fuer den Dreifach-Tipper.
  // In der Einfangphase, damit Chessground den Tipper trotzdem bekommt.
  function onPointerDownCapture(e: ReactPointerEvent) {
    if (drawMode) return;
    if (e.button === 2) {
      e.preventDefault();
      e.stopPropagation();
      drawFrom(e.nativeEvent, false);
      return;
    }
    if (e.button !== 0) return;
    const before = drawn;
    const downAt = performance.now();
    const onUp = (u: PointerEvent) => {
      window.removeEventListener('pointerup', onUp);
      const upAt = performance.now();
      if (upAt - downAt < TAP_HOLD_MS && keyAt(u.clientX, u.clientY)) tapped(downAt, upAt, before);
    };
    window.addEventListener('pointerup', onUp);
    if (drawn.length > 0) setDrawn([]);
  }

  // Im Zeichenmodus faengt eine Folie ueber dem Brett alles ab: nichts zieht.
  function onCatcherDown(e: ReactPointerEvent) {
    e.preventDefault();
    drawFrom(e.nativeEvent, true);
  }

  // Tasten: m schaltet den Zeichenmodus, darin ist jede Taste allein ein
  // Befehl (wie in FireHorse). Sie gehen vor die Tasten der Sitzung, deshalb in
  // der Einfangphase und mit stopPropagation.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.metaKey || e.ctrlKey) return;
      const target = e.target as HTMLElement | null;
      if (target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA')) return;
      const { drawMode: on, pen: p, collapsed } = live.current;
      if (collapsed) return;
      const done = () => {
        e.preventDefault();
        e.stopPropagation();
      };
      if (e.key === 'm' || e.key === 'M') {
        setDrawMode((v) => !v);
        api.current?.selectSquare(null);
        return done();
      }
      if (!on) return;
      if (e.key >= '1' && e.key <= String(PENS)) {
        setPen({ ...p, color: Number(e.key) - 1 });
        return done();
      }
      switch (e.key) {
        case 'ArrowRight':
          setPen({ ...p, color: (p.color + 1) % PENS });
          return done();
        case 'ArrowLeft':
          setPen({ ...p, color: (p.color + PENS - 1) % PENS });
          return done();
        case 'ArrowUp':
        case 'ArrowDown':
        case 'o':
        case 'O':
          setPen({ ...p, field: !p.field });
          return done();
        case 'x':
        case 'X':
          setDrawn([]);
          return done();
        case 'u':
        case 'U':
        case 'Escape':
          setDrawMode(false);
          return done();
      }
    };
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  }, []);

  const vars: Record<string, string> = { '--sq-light': props.light, '--sq-dark': props.dark };
  props.pens.forEach((p, i) => {
    vars[`--pen${i}`] = p.hex;
    // Ausgefuellte Felder etwas durchsichtiger, damit die Figur sichtbar bleibt.
    vars[`--pen${i}-field`] = p.hex + '8F';
  });

  const lines = [...drawn, ...(drawing ? [drawing] : [])].filter((m) => !m.field);

  return (
    <div
      className={`board-frame ${props.collapsed ? 'collapsed' : ''} ${drawMode ? 'drawing' : ''}`}
      style={vars as CSSProperties}
      onPointerDownCapture={onPointerDownCapture}
    >
      <div className="board-host" ref={host} />

      {lines.length > 0 && (
        <svg className="marks" viewBox="0 0 8 8" aria-hidden>
          {lines.map((m, i) => (
            <MarkShape key={i} mark={m} color={props.pens[m.color]?.hex ?? '#15781B'} centre={centre} />
          ))}
        </svg>
      )}

      {drawMode && (
        <>
          <div className="draw-catcher" onPointerDown={onCatcherDown} onContextMenu={(e) => e.preventDefault()} />
          <div className="draw-bar top">
            <span>✎ Zeichnen</span>
            <button className="link" onClick={() => setDrawn([])} title="Alles wegwischen (x)">
              Löschen
            </button>
            <button className="link done" onClick={() => setDrawMode(false)} title="Zeichnen beenden (u, Esc)">
              Fertig
            </button>
          </div>
          <div className="draw-bar bottom">
            {props.pens.map((p, i) => (
              <button
                key={i}
                className={`pen-dot ${pen.color === i ? 'on' : ''}`}
                style={{ backgroundColor: p.hex }}
                title={`${p.label} (${i + 1})`}
                aria-pressed={pen.color === i}
                onClick={() => setPen({ ...pen, color: i })}
              />
            ))}
            {[false, true].map((field) => (
              <button
                key={String(field)}
                className={`pen-shape ${field ? '' : 'first'} ${pen.field === field ? 'on' : ''}`}
                title={field ? 'Feld ausfüllen (o)' : 'Kreis (o)'}
                aria-pressed={pen.field === field}
                onClick={() => setPen({ ...pen, field })}
              >
                <span
                  className={field ? 'shape-field' : 'shape-circle'}
                  style={field ? { background: props.pens[pen.color].hex } : { borderColor: props.pens[pen.color].hex }}
                />
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  );
}

/** Ein Pfeil oder Kreis, wie auf lichess. */
function MarkShape({ mark, color, centre }: { mark: Mark; color: string; centre: (k: Key) => [number, number] }) {
  const [fx, fy] = centre(mark.from);
  if (mark.from === mark.to) {
    return <circle cx={fx} cy={fy} r={0.45} fill="none" stroke={color} strokeOpacity={0.8} strokeWidth={0.08} />;
  }
  const [tx, ty] = centre(mark.to);
  const len = Math.hypot(tx - fx, ty - fy);
  const dx = (tx - fx) / len;
  const dy = (ty - fy) / len;
  const head = 0.4;
  // Der Schaft beginnt neben der Figur, von der er kommt, und endet, wo die Spitze anfaengt.
  const sx = fx + dx * 0.25;
  const sy = fy + dy * 0.25;
  const ex = tx - dx * head;
  const ey = ty - dy * head;
  const wx = -dy * head * 0.45;
  const wy = dx * head * 0.45;
  return (
    <g opacity={0.8}>
      <line x1={sx} y1={sy} x2={ex} y2={ey} stroke={color} strokeWidth={0.16} strokeLinecap="round" />
      <polygon points={`${tx},${ty} ${ex + wx},${ey + wy} ${ex - wx},${ey - wy}`} fill={color} />
    </g>
  );
}
