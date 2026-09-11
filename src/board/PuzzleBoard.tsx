import { useEffect, useRef } from 'react';
import { Chessground } from '@lichess-org/chessground';
import type { Api } from '@lichess-org/chessground/api';
import type { Color, Key } from '@lichess-org/chessground/types';

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
}

export function PuzzleBoard(props: Props) {
  const host = useRef<HTMLDivElement>(null);
  const api = useRef<Api | null>(null);
  // Ueber ein Ref, damit die Chessground-Instanz beim Neuaufbau nicht auf einen
  // veralteten Handler zeigt.
  const onMove = useRef(props.onMove);
  onMove.current = props.onMove;

  useEffect(() => {
    if (!host.current) return;
    const supportsDrag = window.matchMedia('(hover: hover) and (pointer: fine)').matches;

    api.current = Chessground(host.current, {
      fen: props.fen,
      orientation: props.orientation,
      turnColor: props.turnColor,
      coordinates: true,
      addPieceZIndex: true,
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
        color: props.movable ? props.orientation : undefined,
        dests: props.movable ? props.dests : new Map(),
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
  ]);

  useEffect(() => {
    api.current?.setAutoShapes(
      props.hint ? [{ orig: props.hint, brush: 'green' }] : [],
    );
  }, [props.hint]);

  return <div className="board-host" ref={host} />;
}
