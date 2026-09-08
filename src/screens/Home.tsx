import { useCallback, useEffect, useRef, useState } from 'react';
import {
  activateOpening,
  catalogSearch,
  favoritesSummary,
  listActivated,
  resolveOpening,
  type CatalogHit,
  type OpeningSummary,
  type Resolved,
} from '../api/commands';

// Beim allerersten Start vorbelegt.
const SEED = ['Queens_Gambit_Accepted', 'Trompowsky_Attack', 'Rapport-Jobava_System'];

interface Props {
  onOpen: (slug: string, label: string) => void;
  onSettings: () => void;
}

export function Home({ onOpen, onSettings }: Props) {
  const [openings, setOpenings] = useState<OpeningSummary[] | null>(null);
  const [favs, setFavs] = useState<OpeningSummary | null>(null);
  const [input, setInput] = useState('');
  const [hits, setHits] = useState<CatalogHit[]>([]);
  const [found, setFound] = useState<Resolved | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const seeded = useRef(false);

  const reload = useCallback(async () => {
    const [list, f] = await Promise.all([listActivated(), favoritesSummary()]);
    setOpenings(list);
    setFavs(f);
  }, []);

  useEffect(() => {
    (async () => {
      let list = await listActivated();
      if (list.length === 0 && !seeded.current) {
        seeded.current = true;
        for (const slug of SEED) {
          try {
            await activateOpening(slug);
          } catch {
            /* Eine fehlende Eroeffnung soll den Start nicht blockieren. */
          }
        }
        list = await listActivated();
      }
      setOpenings(list);
      setFavs(await favoritesSummary());
    })();
  }, []);

  // Vorschlagsliste waehrend des Tippens.
  useEffect(() => {
    const q = input.trim();
    if (q.length < 2 || q.includes('/')) {
      setHits([]);
      return;
    }
    let alive = true;
    const t = setTimeout(async () => {
      const r = await catalogSearch(q, 8);
      if (alive) setHits(r);
    }, 140);
    return () => {
      alive = false;
      clearTimeout(t);
    };
  }, [input]);

  async function lookup(value: string) {
    setError(null);
    setFound(null);
    setHits([]);
    if (!value.trim()) return;
    try {
      setFound(await resolveOpening(value));
    } catch (e) {
      setError(String(e));
    }
  }

  async function add(slug: string) {
    setBusy(true);
    try {
      await activateOpening(slug);
      await reload();
      setFound(null);
      setInput('');
      setError(null);
    } catch (e) {
      setError(String(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="screen">
      <header className="topbar">
        <h1>Schachtrainer</h1>
        <button className="ghost" onClick={onSettings}>
          Einstellungen
        </button>
      </header>

      {openings === null ? (
        <p className="muted">Lade …</p>
      ) : (
        <div className="tiles">
          {favs && (
            <button
              className="tile favtile"
              onClick={() => onOpen(favs.slug, favs.name)}
            >
              <span className="tile-name">
                <span className="heart on inline">♥</span> {favs.name}
              </span>
              <span className="tile-counts">
                {favs.due_count > 0 && <b className="due">{favs.due_count} fällig</b>}
                {favs.due_count > 0 && favs.new_count > 0 && <span className="dot">·</span>}
                {favs.new_count > 0 && <b className="new">{favs.new_count} neu</b>}
                {favs.due_count === 0 && favs.new_count === 0 && (
                  <span className="muted">alles erledigt</span>
                )}
              </span>
              <span className="tile-total muted">
                {favs.total.toLocaleString('de-DE')} gemerkt, quer durch alle Eröffnungen
              </span>
            </button>
          )}
          {openings.map((o) => {
            const done = o.total - o.new_count;
            const pct = o.total ? Math.round((done / o.total) * 100) : 0;
            return (
              <button key={o.slug} className="tile" onClick={() => onOpen(o.slug, o.name)}>
                <span className="tile-name">{o.name}</span>
                <span className="tile-counts">
                  {o.due_count > 0 && <b className="due">{o.due_count} fällig</b>}
                  {o.due_count > 0 && o.new_count > 0 && <span className="dot">·</span>}
                  {o.new_count > 0 && <b className="new">{o.new_count} neu</b>}
                  {o.due_count === 0 && o.new_count === 0 && <span className="muted">alles erledigt</span>}
                </span>
                <span className="bar">
                  <span className="bar-fill" style={{ width: `${pct}%` }} />
                </span>
                <span className="tile-total muted">
                  {done.toLocaleString('de-DE')} von {o.total.toLocaleString('de-DE')} begonnen
                </span>
              </button>
            );
          })}
        </div>
      )}

      <section className="adder">
        <label htmlFor="add">Eröffnung hinzufügen</label>
        <div className="add-row">
          <input
            id="add"
            value={input}
            placeholder="Lichess-URL einfügen oder Namen tippen"
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && lookup(input)}
            autoComplete="off"
            spellCheck={false}
          />
          <button onClick={() => lookup(input)} disabled={busy || !input.trim()}>
            Suchen
          </button>
        </div>

        {hits.length > 0 && (
          <ul className="suggestions">
            {hits.map((h) => (
              <li key={h.slug}>
                <button onClick={() => lookup(h.slug)} disabled={h.active}>
                  <span>{h.name}</span>
                  <span className="muted">
                    {h.count.toLocaleString('de-DE')} {h.active ? '· bereits aktiv' : ''}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        )}

        {error && <p className="error">{error}</p>}

        {found && (
          <div className="found">
            <div className="found-main">
              <div>
                <strong>{found.hit.name}</strong>
                <span className="muted"> · {found.hit.count.toLocaleString('de-DE')} Puzzle</span>
              </div>
              <button
                onClick={() => add(found.hit.slug)}
                disabled={busy || found.hit.active}
              >
                {found.hit.active ? 'Schon aktiv' : 'Hinzufügen'}
              </button>
            </div>
            {found.related.length > 0 && (
              <div className="related">
                <p className="muted">
                  Lichess führt diese als eigene Eröffnungen — ohne sie fehlen dir die
                  jeweiligen Puzzle:
                </p>
                {found.related.map((r) => (
                  <div key={r.slug} className="related-row">
                    <span>
                      {r.name} <span className="muted">· {r.count.toLocaleString('de-DE')}</span>
                    </span>
                    <button className="ghost" onClick={() => add(r.slug)} disabled={busy || r.active}>
                      {r.active ? 'aktiv' : 'auch hinzufügen'}
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </section>
    </div>
  );
}
