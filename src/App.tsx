import { useCallback, useEffect, useState } from 'react';
import { Home } from './screens/Home';
import { Opening } from './screens/Opening';
import { Session } from './screens/Session';
import { Settings } from './screens/Settings';
import { getSetting, setSetting, type BatchFilter } from './api/commands';
import { DEFAULT_SETTINGS, type SrsSettings } from './srs/scheduler';

type View =
  | { name: 'home' }
  | { name: 'opening'; slug: string; label: string }
  | { name: 'session'; slug: string; label: string; filter: BatchFilter }
  | { name: 'settings' };

const SETTINGS_KEY = 'srs';

export function App() {
  const [view, setView] = useState<View>({ name: 'home' });
  const [settings, setSettings] = useState<SrsSettings>(DEFAULT_SETTINGS);
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
      setReady(true);
    })();
  }, []);

  /** Speichern ohne den Bildschirm zu wechseln - fuer die Schnellauswahl. */
  const saveQuiet = useCallback(async (s: SrsSettings) => {
    setSettings(s);
    await setSetting(SETTINGS_KEY, JSON.stringify(s));
  }, []);

  const save = useCallback(
    async (s: SrsSettings) => {
      await saveQuiet(s);
      setView({ name: 'home' });
    },
    [saveQuiet],
  );

  if (!ready) return <p className="muted pad">Starte …</p>;

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
        />
      );

    case 'session':
      return (
        <Session
          slug={view.slug}
          name={view.label}
          filter={view.filter}
          settings={settings}
          onBack={() => {
            setRev((n) => n + 1);
            setView({ name: 'opening', slug: view.slug, label: view.label });
          }}
        />
      );

    case 'settings':
      return (
        <Settings settings={settings} onSave={save} onBack={() => setView({ name: 'home' })} />
      );
  }
}
