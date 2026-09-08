import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { Key } from '@lichess-org/chessground/types';
import type { Role, SquareName } from 'chessops/types';
import type { IPreview } from 'ts-fsrs';

import { PuzzleBoard } from '../board/PuzzleBoard';
import { PuzzleRunner } from '../board/solve';
import {
  fetchGame,
  nextBatch,
  recordReview,
  resetPuzzles,
  toggleFavorite,
  type BatchFilter,
  type GameInfo,
  type PuzzleDto,
} from '../api/commands';
import {
  fromCard,
  formatInterval,
  GRADES,
  GRADE_KEY,
  GRADE_LABEL,
  gradeForKey,
  makeScheduler,
  toCard,
  toReview,
  type SrsSettings,
} from '../srs/scheduler';

type Phase = 'loading' | 'solving' | 'graded' | 'empty' | 'finished';

const PROMO_LABEL: Partial<Record<Role, string>> = {
  queen: 'Dame',
  rook: 'Turm',
  bishop: 'Läufer',
  knight: 'Springer',
};

interface Props {
  slug: string;
  name: string;
  filter: BatchFilter;
  settings: SrsSettings;
  onBack: () => void;
}

export function Session({ slug, name, filter, settings, onBack }: Props) {
  const scheduler = useMemo(() => makeScheduler(settings), [settings]);
  const [queue, setQueue] = useState<PuzzleDto[]>([]);
  const [pos, setPos] = useState(0);
  const [phase, setPhase] = useState<Phase>('loading');
  const [runner, setRunner] = useState<PuzzleRunner | null>(null);
  const [revision, setRevision] = useState(0);
  const [feedback, setFeedback] = useState<'none' | 'wrong' | 'correct'>('none');
  const [preview, setPreview] = useState<IPreview | null>(null);
  const [gradedAt, setGradedAt] = useState<Date>(new Date());
  const [promotion, setPromotion] = useState<{ orig: SquareName; dest: SquareName } | null>(null);
  const [showSolution, setShowSolution] = useState(false);
  const [game, setGame] = useState<GameInfo | 'loading' | 'error' | null>(null);
  const [tally, setTally] = useState({ solved: 0, slipped: 0 });
  const [note, setNote] = useState<string | null>(null);
  // Gemerkte Puzzle dieser Sitzung; der Ausgangswert kommt aus dem Stapel.
  const [favorites, setFavorites] = useState<Set<string>>(new Set());
  const startedAt = useRef(Date.now());
  const replyTimer = useRef<number | null>(null);

  // Jeder Zugversuch zaehlt hoch - auch der abgelehnte, damit das Brett
  // zurueckspringt.
  const tick = () => setRevision((n) => n + 1);

  useEffect(() => {
    (async () => {
      const batch = await nextBatch(slug, filter);
      setQueue(batch);
      setFavorites(new Set(batch.filter((p) => p.favorite).map((p) => p.id)));
      if (batch.length === 0) {
        setPhase('empty');
        return;
      }
      setRunner(new PuzzleRunner(batch[0]));
      setPhase('solving');
      startedAt.current = Date.now();
    })();
    return () => {
      if (replyTimer.current) window.clearTimeout(replyTimer.current);
    };
  }, [slug, filter]);

  const current = queue[pos];

  const finishPuzzle = useCallback(() => {
    setPhase('graded');
    setPreview(scheduler.repeat(toCard(current?.card ?? null), new Date()) as IPreview);
    setGradedAt(new Date());
  }, [scheduler, current]);

  function handleMove(orig: Key, dest: Key) {
    if (!runner || phase !== 'solving') return;
    // 'a0' steht bei chessground fuer Einsetzzuege, die es hier nicht gibt.
    if (orig === 'a0' || dest === 'a0') return;

    if (runner.needsPromotion(orig, dest)) {
      setPromotion({ orig, dest });
      return;
    }
    applyMove(orig, dest);
  }

  function applyMove(orig: SquareName, dest: SquareName, role?: Role) {
    if (!runner) return;
    const res = runner.play(orig, dest, role);
    tick();

    if (res.outcome === 'wrong') {
      setFeedback('wrong');
      return;
    }

    setFeedback('correct');
    if (res.outcome === 'solved') {
      setTally((t) => ({
        solved: t.solved + 1,
        slipped: t.slipped + (runner.wrongAttempts > 0 || runner.usedHint ? 1 : 0),
      }));
      finishPuzzle();
      return;
    }

    // Gegenzug mit kurzer Verzoegerung, damit er sichtbar wird.
    replyTimer.current = window.setTimeout(() => {
      runner.applyReply();
      tick();
      if (runner.finished) finishPuzzle();
    }, 380);
  }

  async function grade(gradeValue: number) {
    if (!preview || !current) return;
    const item = preview[gradeValue as keyof IPreview] as {
      card: Parameters<typeof fromCard>[0];
      log: Parameters<typeof toReview>[0];
    };
    await recordReview(
      current.id,
      fromCard(item.card),
      toReview(item.log, Date.now(), Date.now() - startedAt.current),
    );
    advance();
  }

  function advance() {
    const next = pos + 1;
    setFeedback('none');
    setPreview(null);
    setShowSolution(false);
    setGame(null);
    setPromotion(null);
    if (next >= queue.length) {
      setPhase('finished');
      return;
    }
    setPos(next);
    setRunner(new PuzzleRunner(queue[next]));
    setPhase('solving');
    startedAt.current = Date.now();
  }

  // Bewerten mit der linken Hand auf YXCV, alternativ 1 bis 4. F merkt das
  // Puzzle und geht auch waehrend des Loesens.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      if (e.key === 'f' || e.key === 'F') {
        e.preventDefault();
        flipFavorite();
        return;
      }
      if (phase !== 'graded') return;
      if (e.key === ' ') {
        e.preventDefault();
        grade(3); // Leertaste = Gut, wie in Anki
        return;
      }
      const g = gradeForKey(e.key);
      if (g !== undefined) {
        e.preventDefault();
        grade(g);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });

  /** Dieselbe Auswahl noch einmal, ohne am Wiederholungsplan zu ruetteln. */
  function replay() {
    setPos(0);
    setRunner(new PuzzleRunner(queue[0]));
    setPhase('solving');
    setFeedback('none');
    setPreview(null);
    setShowSolution(false);
    setGame(null);
    setNote(null);
    setTally({ solved: 0, slipped: 0 });
    startedAt.current = Date.now();
  }

  /** Setzt die Karten dieser Puzzle zurueck - sie gelten dann wieder als neu. */
  async function forgetThese() {
    const n = await resetPuzzles(queue.map((p) => p.id));
    setNote(`${n.toLocaleString('de-DE')} Karten zurückgesetzt.`);
  }

  async function flipFavorite() {
    if (!current) return;
    const nowFav = await toggleFavorite(current.id);
    setFavorites((prev) => {
      const next = new Set(prev);
      if (nowFav) next.add(current.id);
      else next.delete(current.id);
      return next;
    });
  }

  async function loadGame() {
    if (!current) return;
    setGame('loading');
    try {
      setGame(await fetchGame(current.id));
    } catch {
      setGame('error');
    }
  }

  if (phase === 'loading') return <p className="muted pad">Lade Puzzle …</p>;

  if (phase === 'empty') {
    return (
      <div className="screen pad">
        <p>Für diese Auswahl gibt es gerade keine Puzzle.</p>
        <button onClick={onBack}>Zurück</button>
      </div>
    );
  }

  if (phase === 'finished') {
    return (
      <div className="screen pad center">
        <h2>Sitzung beendet</h2>
        <p>
          {tally.solved.toLocaleString('de-DE')} Puzzle bearbeitet
          {tally.slipped > 0 && `, davon ${tally.slipped} mit Fehlgriff oder Hilfe`}.
        </p>
        <div className="actions finish-actions">
          <button onClick={replay}>Dieselben nochmal</button>
          <button className="ghost" onClick={forgetThese}>
            Fortschritt dieser {queue.length} Puzzle zurücksetzen
          </button>
          <button className="ghost" onClick={onBack}>
            Zurück zur Eröffnung
          </button>
        </div>
        {note && <p className="ok small">{note}</p>}
      </div>
    );
  }

  if (!runner || !current) return null;

  const solverTurn = runner.turnColor === runner.solverColor;

  return (
    <div className="session">
      <header className="topbar">
        <button className="ghost" onClick={onBack}>
          ← Beenden
        </button>
        <span className="progress">
          {pos + 1} / {queue.length}
        </span>
        <span className="muted">{name}</span>
      </header>

      <div className="session-body">
        <div className="board-wrap">
          <PuzzleBoard
            fen={runner.fen}
            orientation={runner.solverColor}
            turnColor={runner.turnColor}
            dests={runner.dests}
            lastMove={runner.lastMove}
            check={runner.inCheck}
            movable={phase === 'solving' && solverTurn && !runner.finished}
            hint={showSolution ? runner.hintSquare : undefined}
            revision={revision}
            onMove={handleMove}
          />
          {promotion && (
            <div className="promo">
              <p>Umwandeln in:</p>
              <div className="promo-row">
                {(['queen', 'rook', 'bishop', 'knight'] as Role[]).map((r) => (
                  <button
                    key={r}
                    onClick={() => {
                      const p = promotion;
                      setPromotion(null);
                      applyMove(p.orig, p.dest, r);
                    }}
                  >
                    {PROMO_LABEL[r]}
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>

        <aside className="side">
          <div className="puzzle-meta">
            <div className="meta-row">
              <span className="rating">Rating {current.rating}</span>
              <button
                className={`heart ${favorites.has(current.id) ? 'on' : ''}`}
                onClick={flipFavorite}
                title={
                  favorites.has(current.id)
                    ? 'Aus den gemerkten Puzzeln entfernen (f)'
                    : 'Puzzle merken (f)'
                }
                aria-pressed={favorites.has(current.id)}
              >
                {favorites.has(current.id) ? '♥' : '♡'}
              </button>
            </div>
            <span className="muted small">{current.name}</span>
          </div>

          {phase === 'solving' && (
            <>
              <p className={`verdict ${feedback}`}>
                {feedback === 'wrong'
                  ? 'Nicht der gesuchte Zug.'
                  : feedback === 'correct'
                    ? 'Richtig — weiter.'
                    : solverTurn
                      ? `${runner.solverColor === 'white' ? 'Weiß' : 'Schwarz'} am Zug. Finde den besten Zug.`
                      : 'Der Gegner zieht …'}
              </p>
              {runner.wrongAttempts > 0 && (
                <p className="muted small">
                  {runner.wrongAttempts}{' '}
                  {runner.wrongAttempts === 1 ? 'Fehlversuch' : 'Fehlversuche'}
                </p>
              )}
              <div className="actions">
                <button
                  className="ghost"
                  onClick={() => {
                    setShowSolution(true);
                    const res = runner.revealNext();
                    tick();
                    if (res.outcome === 'solved') {
                      setTally((t) => ({ solved: t.solved + 1, slipped: t.slipped + 1 }));
                      finishPuzzle();
                    } else if (res.reply) {
                      replyTimer.current = window.setTimeout(() => {
                        runner.applyReply();
                        tick();
                        if (runner.finished) finishPuzzle();
                      }, 380);
                    }
                  }}
                >
                  Lösung zeigen
                </button>
              </div>
              {showSolution && (
                <p className="solution">Weiter: {runner.remainingSan().join(' ') || '—'}</p>
              )}
            </>
          )}

          {phase === 'graded' && preview && (
            <div className="grading">
              <p className="verdict correct">
                Gelöst
                {runner.wrongAttempts > 0 && ` — nach ${runner.wrongAttempts} Fehlversuch${runner.wrongAttempts === 1 ? '' : 'en'}`}
                {runner.usedHint && ' — mit Hilfe'}
              </p>
              <p className="muted small">Wie ging es?</p>
              <div className="grades">
                {GRADES.map((g) => {
                  const item = preview[g as keyof IPreview] as { card: { due: Date } };
                  return (
                    <button key={g} className={`grade g${g}`} onClick={() => grade(g)}>
                      <b>{GRADE_LABEL[g]}</b>
                      <span>{formatInterval(gradedAt, item.card.due)}</span>
                      <kbd>{GRADE_KEY[g].toUpperCase()}</kbd>
                    </button>
                  );
                })}
              </div>

              <div className="actions">
                <button className="ghost" onClick={loadGame}>
                  Partie ansehen
                </button>
              </div>
              {game === 'loading' && <p className="muted small">Lade von Lichess …</p>}
              {game === 'error' && (
                <p className="muted small">Nicht erreichbar — dafür brauchst du Internet.</p>
              )}
              {game && typeof game === 'object' && (
                <div className="gameinfo">
                  <p className="small">{game.players.join(' — ')}</p>
                  <button
                    className="ghost"
                    onClick={() => navigator.clipboard?.writeText(game.url)}
                  >
                    {game.url} · kopieren
                  </button>
                </div>
              )}
            </div>
          )}
        </aside>
      </div>
    </div>
  );
}
