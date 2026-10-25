import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import type { Key } from '@lichess-org/chessground/types';
import { chessgroundDests } from 'chessops/compat';
import { makeFen } from 'chessops/fen';
import { parseSquare } from 'chessops/util';
import type { Role, SquareName } from 'chessops/types';

import { PuzzleBoard } from '../board/PuzzleBoard';
import { pensFrom, type Mark } from '../board/drawing';
import type { BoardPrefs } from '../board/prefs';
import {
  addMove,
  canDelete,
  deleteAt,
  endOf,
  isEmpty,
  loadStudy,
  nodeAt,
  onSolution,
  positionAt,
  promote,
  saveStudy as serialize,
  setComment,
  setMarks,
  startOf,
  type Path,
  type Study as Tree,
  type StudyNode,
} from '../board/study';
import { getStudy, saveStudy, type PuzzleDto } from '../api/commands';

const PROMO: [Role, string, string][] = [
  ['queen', 'q', 'Dame'],
  ['rook', 'r', 'Turm'],
  ['bishop', 'b', 'Läufer'],
  ['knight', 'n', 'Springer'],
];

/** So lange nach der letzten Aenderung wird gespeichert - beim Tippen eines Kommentars nicht bei jedem Buchstaben. */
const SAVE_DELAY_MS = 400;

interface Props {
  puzzle: PuzzleDto;
  board: BoardPrefs;
  onBack: () => void;
}

export function Study({ puzzle, board, onBack }: Props) {
  const pens = useMemo(() => pensFrom(board.pens), [board.pens]);
  const start = useMemo(() => startOf(puzzle), [puzzle]);
  const [tree, setTree] = useState<Tree | null>(null);
  const [path, setPath] = useState<Path>([]);
  const [revision, setRevision] = useState(0);
  const [promotion, setPromotion] = useState<{ orig: SquareName; dest: SquareName } | null>(null);
  const pending = useRef<{ timer: number; tree: Tree } | null>(null);

  useEffect(() => {
    let alive = true;
    getStudy(puzzle.id)
      .catch(() => null)
      .then((raw) => {
        if (!alive) return;
        setTree(loadStudy(puzzle, raw));
      });
    return () => {
      alive = false;
    };
  }, [puzzle]);

  function write(t: Tree) {
    saveStudy(puzzle.id, isEmpty(t) ? null : serialize(t));
  }

  // Wer den Bildschirm verlaesst, waehrend noch etwas aussteht, verliert es nicht.
  useEffect(
    () => () => {
      const p = pending.current;
      if (!p) return;
      window.clearTimeout(p.timer);
      write(p.tree);
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [],
  );

  function change(next: Tree) {
    setTree(next);
    if (pending.current) window.clearTimeout(pending.current.timer);
    const timer = window.setTimeout(() => {
      pending.current = null;
      write(next);
    }, SAVE_DELAY_MS);
    pending.current = { timer, tree: next };
  }

  const pos = useMemo(() => positionAt(puzzle, path), [puzzle, path]);
  const node = tree ? nodeAt(tree, path) : null;

  // Pfeiltasten wie auf lichess. Im Zeichenmodus nimmt das Brett die Pfeile
  // vorher fuer die Stifte weg, im Kommentarfeld bleiben sie beim Text.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (!tree || e.metaKey || e.ctrlKey || e.altKey) return;
      const target = e.target as HTMLElement | null;
      if (target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA')) return;
      const go = (p: Path) => {
        e.preventDefault();
        setPath(p);
      };
      switch (e.key) {
        case 'ArrowLeft':
          return go(path.slice(0, -1));
        case 'ArrowRight': {
          const next = nodeAt(tree, path).children[0];
          return go(next ? [...path, next.uci] : path);
        }
        case 'ArrowUp':
        case 'Home':
          return go([]);
        case 'ArrowDown':
        case 'End':
          return go(endOf(tree, path));
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });

  if (!tree || !node) return <p className="muted pad">Lade Variantenbaum …</p>;

  function play(orig: SquareName, dest: SquareName, promo?: string) {
    if (!tree) return;
    const res = addMove(puzzle, tree, path, `${orig}${dest}${promo ?? ''}`);
    if (res.study !== tree) change(res.study);
    setPath(res.path);
    setRevision((n) => n + 1);
  }

  function handleMove(orig: Key, dest: Key) {
    if (orig === 'a0' || dest === 'a0') return;
    const piece = pos.board.get(parseSquare(orig)!);
    if (piece?.role === 'pawn' && (dest[1] === '8' || dest[1] === '1')) {
      setPromotion({ orig, dest });
      return;
    }
    play(orig, dest);
  }

  const last = path.at(-1) ?? start.opening;
  const lastMove = last ? ([last.slice(0, 2), last.slice(2, 4)] as [Key, Key]) : undefined;
  const startPly = (start.pos.fullmoves - 1) * 2 + (start.pos.turn === 'white' ? 0 : 1);
  const solution = onSolution(tree, path);
  const siblings = path.length > 0 ? nodeAt(tree, path.slice(0, -1)).children : [];
  const at = siblings.findIndex((c) => c.uci === path.at(-1));
  const canPromote = canDelete(tree, path) && at > 0 && !siblings[at - 1].solution;
  const next = node.children[0];

  return (
    <div className="session">
      <header className="topbar">
        <button className="ghost" onClick={onBack}>
          ← Zurück
        </button>
        <span className="topbar-name">
          Variantenbaum <span className="muted">· {puzzle.rating} · {puzzle.name}</span>
        </span>
        <span />
      </header>

      <div className="session-body">
        <div className="board-wrap">
          <PuzzleBoard
            fen={makeFen(pos.toSetup())}
            orientation={start.pos.turn}
            turnColor={pos.turn}
            dests={chessgroundDests(pos)}
            lastMove={lastMove}
            check={pos.isCheck()}
            movable={!promotion}
            bothSides
            revision={revision}
            onMove={handleMove}
            light={board.light}
            dark={board.dark}
            pens={pens}
            marks={node.marks}
            onMarks={(m: Mark[]) => change(setMarks(tree, path, m))}
          />
          {promotion && (
            <div className="promo">
              <p>Umwandeln in:</p>
              <div className="promo-row">
                {PROMO.map(([role, c, label]) => (
                  <button
                    key={role}
                    onClick={() => {
                      const p = promotion;
                      setPromotion(null);
                      play(p.orig, p.dest, c);
                    }}
                  >
                    {label}
                  </button>
                ))}
                <button
                  className="ghost"
                  onClick={() => {
                    setPromotion(null);
                    setRevision((n) => n + 1);
                  }}
                >
                  Abbrechen
                </button>
              </div>
            </div>
          )}
          <div className="study-nav">
            <button className="ghost" onClick={() => setPath([])} disabled={path.length === 0} title="Zum Anfang (↑)">
              ⏮
            </button>
            <button className="ghost" onClick={() => setPath(path.slice(0, -1))} disabled={path.length === 0} title="Zurück (←)">
              ◀
            </button>
            <button className="ghost" onClick={() => next && setPath([...path, next.uci])} disabled={!next} title="Weiter (→)">
              ▶
            </button>
            <button className="ghost" onClick={() => setPath(endOf(tree, path))} disabled={!next} title="Zum Ende (↓)">
              ⏭
            </button>
          </div>
        </div>

        <aside className="side">
          <p className="muted small">
            Zieh auf dem Brett, um eine eigene Abzweigung anzulegen — für beide Seiten. Abgefragt
            wird beim Üben weiterhin nur die Lösung. Gezeichnetes bleibt hier je Stellung gespeichert.
          </p>

          <div className="study-tree moves">
            <button className={`mv root ${path.length === 0 ? 'on' : ''}`} onClick={() => setPath([])}>
              Start
            </button>{' '}
            {tree.root.comment && <span className="cmt">{tree.root.comment} </span>}
            <Moves parent={tree.root} parentPath={[]} ply={startPly} current={path} onPick={setPath} />
          </div>

          <div className="study-node">
            <span className={`badge ${solution ? 'sol' : 'own'}`}>
              {path.length === 0 ? 'Ausgangsstellung' : solution ? 'Lösung' : 'Eigene Variante'}
            </span>
            <textarea
              value={node.comment ?? ''}
              placeholder={path.length === 0 ? 'Notiz zur Stellung …' : `Notiz zu ${node.san} …`}
              rows={3}
              onChange={(e) => change(setComment(tree, path, e.target.value))}
            />
            {canDelete(tree, path) && (
              <div className="actions">
                <button
                  className="ghost"
                  onClick={() => {
                    const res = deleteAt(tree, path);
                    change(res.study);
                    setPath(res.path);
                  }}
                >
                  Variante ab {node.san} löschen
                </button>
                {canPromote && (
                  <button className="ghost" onClick={() => change(promote(tree, path))}>
                    Nach vorn
                  </button>
                )}
              </div>
            )}
          </div>
        </aside>
      </div>
    </div>
  );
}

/** "12." fuer Weiss, "12…" fuer Schwarz. */
function number(ply: number): string {
  return `${Math.floor(ply / 2) + 1}${ply % 2 === 0 ? '.' : '…'}`;
}

/**
 * Die Fortsetzungen von `parent` als Zugliste wie in einer PGN: die
 * Hauptfortsetzung, dahinter jede Abzweigung in Klammern, dann geht die
 * Hauptfortsetzung weiter.
 */
function Moves({
  parent,
  parentPath,
  ply,
  current,
  onPick,
  numbered = true,
}: {
  parent: StudyNode;
  parentPath: Path;
  ply: number;
  current: Path;
  onPick: (p: Path) => void;
  /** Muss der naechste Zug seine Nummer tragen, auch wenn Schwarz zieht? */
  numbered?: boolean;
}) {
  const [main, ...rest] = parent.children;
  if (!main) return null;
  const out: ReactNode[] = [];
  const move = (n: StudyNode, withNumber: boolean) => {
    const p = [...parentPath, n.uci];
    const on = p.length === current.length && p.every((u, i) => u === current[i]);
    return (
      <span key={`m${n.uci}`}>
        {(withNumber || ply % 2 === 0) && <span className="muted">{number(ply)} </span>}
        <button className={`mv ${n.solution ? 'sol' : ''} ${on ? 'on' : ''}`} onClick={() => onPick(p)}>
          {n.san}
        </button>{' '}
        {n.comment && <span className="cmt">{n.comment} </span>}
      </span>
    );
  };
  out.push(move(main, numbered));
  for (const v of rest) {
    out.push(
      <span key={`v${v.uci}`} className="var">
        ({move(v, true)}
        <Moves parent={v} parentPath={[...parentPath, v.uci]} ply={ply + 1} current={current} onPick={onPick} numbered={!!v.comment} />
        ){' '}
      </span>,
    );
  }
  out.push(
    <Moves
      key="rest"
      parent={main}
      parentPath={[...parentPath, main.uci]}
      ply={ply + 1}
      current={current}
      onPick={onPick}
      numbered={rest.length > 0 || !!main.comment}
    />,
  );
  return <>{out}</>;
}
