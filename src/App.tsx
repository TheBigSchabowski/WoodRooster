import { useCallback, useEffect, useRef, useState } from 'react';
import { Home } from './screens/Home';
import { Opening } from './screens/Opening';
import { Session } from './screens/Session';
import { Settings } from './screens/Settings';
import { Study } from './screens/Study';
import {
  DUE,
  FAVORITES,
  getSetting,
  listActivated,
  setSetting,
  takeWidgetStart,
  type SessionFilter,
  type PuzzleDto,
} from './api/commands';
import { DEFAULT_SETTINGS, difficultyBand, type SrsSettings } from './srs/scheduler';
import { BOARD_KEY, DEFAULT_BOARD, type BoardPrefs } from './board/prefs';
import { applyPieceColors } from './board/pieces';
import { commandAt, commandOf, listenDoubleTaps, sendCommand } from './tapzones';

type View =
  | { name: 'home' }
  | { name: 'opening'; slug: string; label: string }
  | { name: 'session'; slug: string; label: string; filter: SessionFilter }
  | { name: 'study'; slug: string; label: string; puzzle: PuzzleDto }
  | { name: 'settings' };

const SETTINGS_KEY = 'srs';

/** Dasselbe wie „Üben“ auf der Eröffnungsseite; „Alle fälligen“ nur Fälliges. */
function practiceFilter(slug: string, s: SrsSettings): SessionFilter {
  if (slug === DUE) return { mode: 'due' };
  const [ratingMin, ratingMax] = slug === FAVORITES ? [null, null] : difficultyBand(s);
  return { mode: 'mix', ratingMin, ratingMax, newPerDay: s.newPerDay };
}

export function App() {
  const [view, setView] = useState<View>({ name: 'home' });
  const [settings, setSettings] = useState<SrsSettings>(DEFAULT_SETTINGS);
  const [board, setBoard] = useState<BoardPrefs>(DEFAULT_BOARD);
  const [ready, setReady] = useState(false);
  // Zwingt die Startseite zum Neuladen, wenn sich anderswo etwas geaendert hat.
  const [rev, setRev] = useState(0);

  useEffect(() => {
    (async () => {
      try {
        const raw = await getSetting(SETTINGS_KEY);
        if (raw) setSettings({ ...DEFAULT_SETTINGS, ...JSON.parse(raw) });
      } catch {
        /* Kaputte Einstellungen sollen den Start nicht verhindern. */
      }
      try {
        const raw = await getSetting(BOARD_KEY);
        if (raw) setBoard({ ...DEFAULT_BOARD, ...JSON.parse(raw) });
      } catch {
        /* Dann eben das Standardbrett. */
      }
      setReady(true);
    })();
  }, []);

  /** Speichern ohne den Bildschirm zu wechseln - fuer die Schnellauswahl. */
  const saveQuiet = useCallback(async (s: SrsSettings) => {
    setSettings(s);
    await setSetting(SETTINGS_KEY, JSON.stringify(s));
  }, []);

  const saveBoard = useCallback(async (b: BoardPrefs) => {
    setBoard(b);
    await setSetting(BOARD_KEY, JSON.stringify(b));
  }, []);

  const save = useCallback(
    async (s: SrsSettings, b: BoardPrefs) => {
      await saveQuiet(s);
      await saveBoard(b);
      setView({ name: 'home' });
    },
    [saveQuiet, saveBoard],
  );

  // Figurenfarben gelten fuer jedes Brett der App, auch den Variantenbaum.
  useEffect(() => {
    applyPieceColors(board);
  }, [board.whiteFill, board.whiteLine, board.blackFill, board.blackLine]); // eslint-disable-line react-hooks/exhaustive-deps

  // Doppeltippen auf eine freie Stelle: Blind schaltet hier, alles andere geht
  // an Sitzung und Brett. Eine kurze Meldung sagt, was passiert ist.
  const [toast, setToast] = useState<string | null>(null);
  const live = useRef({ board, saveBoard });
  live.current = { board, saveBoard };
  useEffect(() => {
    let hide = 0;
    const off = listenDoubleTaps(
      () => live.current.board,
      (zone) => {
        const { board: b, saveBoard: saveB } = live.current;
        const id = commandAt(b, zone);
        if (!id) return;
        if (id === 'BLIND') {
          saveB({ ...b, blind: !b.blind });
          setToast(b.blind ? 'Blind aus' : 'Blind an');
        } else {
          sendCommand(id);
          setToast(commandOf(id)?.short ?? null);
        }
        window.clearTimeout(hide);
        hide = window.setTimeout(() => setToast(null), 1200);
      },
    );
    return () => {
      off();
      window.clearTimeout(hide);
    };
  }, []);

  // Antippen einer Eröffnung im Android-Widget startet sofort die Sitzung.
  // MainActivity legt den Slug ab; nachgesehen wird beim Start, beim
  // Sichtbarwerden und auf ihr Signal hin, falls die App schon lief.
  const settingsRef = useRef(settings);
  settingsRef.current = settings;
  useEffect(() => {
    if (!ready) return;
    let alive = true;
    const check = async () => {
      const slug = await takeWidgetStart().catch(() => null);
      if (!slug || !alive) return;
      let label: string | undefined;
      if (slug === FAVORITES) label = 'Gemerkte Puzzle';
      else if (slug === DUE) label = 'Alle fälligen';
      else label = (await listActivated().catch(() => [])).find((o) => o.slug === slug)?.name;
      // Inzwischen entfernt: dann eben die Startseite.
      if (!alive) return;
      setRev((n) => n + 1);
      setView(
        label
          ? { name: 'session', slug, label, filter: practiceFilter(slug, settingsRef.current) }
          : { name: 'home' },
      );
    };
    const onVisible = () => document.visibilityState === 'visible' && check();
    check();
    window.addEventListener('woodrooster-widget', check);
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      alive = false;
      window.removeEventListener('woodrooster-widget', check);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, [ready]);

  if (!ready) return <p className="muted pad">Starte …</p>;

  return (
    <>
      {screen()}
      {toast && (
        <div className="toast" role="status">
          {toast}
        </div>
      )}
    </>
  );

  function screen() {
    switch (view.name) {
      case 'home':
        return (
          <Home
            key={rev}
            onOpen={(slug, label) => setView({ name: 'opening', slug, label })}
            onSettings={() => setView({ name: 'settings' })}
          />
        );

      case 'opening':
        return (
          <Opening
            slug={view.slug}
            name={view.label}
            settings={settings}
            onSettings={saveQuiet}
            onBack={() => setView({ name: 'home' })}
            onChanged={() => setRev((n) => n + 1)}
            onStart={(filter) =>
              setView({ name: 'session', slug: view.slug, label: view.label, filter })
            }
            onStudy={(puzzle) => setView({ name: 'study', slug: view.slug, label: view.label, puzzle })}
          />
        );

      case 'study':
        return (
          <Study
            puzzle={view.puzzle}
            board={board}
            onBack={() => setView({ name: 'opening', slug: view.slug, label: view.label })}
          />
        );

      case 'session':
        return (
          <Session
            // Aus dem Widget kann mitten in einer Sitzung eine andere kommen.
            key={view.slug}
            slug={view.slug}
            name={view.label}
            filter={view.filter}
            settings={settings}
            board={board}
            onBoard={saveBoard}
            onBack={() => {
              setRev((n) => n + 1);
              // „Alle fälligen“ hat keine eigene Eröffnungsseite.
              setView(
                view.slug === DUE
                  ? { name: 'home' }
                  : { name: 'opening', slug: view.slug, label: view.label },
              );
            }}
          />
        );

      case 'settings':
        return (
          <Settings
            settings={settings}
            board={board}
            onSave={save}
            onBack={() => setView({ name: 'home' })}
          />
        );
    }
  }
}
