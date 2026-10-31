import { useCallback, useEffect, useState } from 'react';
import {
  clearFavorites,
  deactivateOpening,
  FAVORITES,
  listFavorites,
  toggleFavorite,
  openingStats,
  resetSrs,
  resolveOpening,
  activateOpening,
  type SessionFilter,
  type CatalogHit,
  type PuzzleDto,
  type Stats,
} from '../api/commands';
import {
  DIFFICULTIES,
  difficultyBand,
  difficultyLabel,
  type SrsSettings,
} from '../srs/scheduler';

const THEMES: [string, string][] = [
  ['', 'alle Motive'],
  ['mateIn1', 'Matt in 1'],
  ['mateIn2', 'Matt in 2'],
  ['mateIn3', 'Matt in 3'],
  ['fork', 'Gabel'],
  ['pin', 'Fesselung'],
  ['skewer', 'Spieß'],
  ['discoveredAttack', 'Abzugsangriff'],
  ['hangingPiece', 'Hängende Figur'],
  ['sacrifice', 'Opfer'],
  ['deflection', 'Ablenkung'],
  ['attraction', 'Hinlenkung'],
  ['trappedPiece', 'Gefangene Figur'],
  ['defensiveMove', 'Verteidigungszug'],
  ['quietMove', 'Stiller Zug'],
  ['crushing', 'Vernichtend'],
];

interface Props {
  slug: string;
  name: string;
  settings: SrsSettings;
  onSettings: (s: SrsSettings) => void;
  onBack: () => void;
  onStart: (filter: SessionFilter) => void;
  onChanged: () => void;
  /** Variantenbaum eines gemerkten Puzzles oeffnen. */
  onStudy: (puzzle: PuzzleDto) => void;
}

export function Opening({
  slug,
  name,
  settings,
  onSettings,
  onBack,
  onStart,
  onChanged,
  onStudy,
}: Props) {
  const [stats, setStats] = useState<Stats | null>(null);
  const [related, setRelated] = useState<CatalogHit[]>([]);
  const [ratingMin, setRatingMin] = useState(600);
  const [ratingMax, setRatingMax] = useState(3000);
  const [theme, setTheme] = useState('');
  const [confirm, setConfirm] = useState<'all' | 'lapsed' | 'remove' | null>(null);
  const [note, setNote] = useState<string | null>(null);
  const [favs, setFavs] = useState<PuzzleDto[] | null>(null);

  const isFavorites = slug === FAVORITES;
  const newPerDay = settings.newPerDay;
  // Die Schwierigkeit soll grosse Eroeffnungen baendigen. Auf eine selbst
  // zusammengestellte Sammlung angewandt wuerde sie nur im Weg stehen - wer ein
  // Puzzle merkt, will es auch ueben, egal bei welchem Rating.
  const band: [number | null, number | null] = isFavorites
    ? [null, null]
    : difficultyBand(settings);

  const reload = useCallback(async () => {
    setStats(await openingStats(slug, band[0], band[1]));
    if (isFavorites) {
      // Der Favoritenordner ist keine Eröffnung - er hat weder Verwandte noch
      // einen Katalogeintrag.
      setRelated([]);
      setFavs(await listFavorites());
      return;
    }
    setFavs(null);
    try {
      const r = await resolveOpening(slug);
      setRelated(r.related.filter((x) => !x.active));
    } catch {
      setRelated([]);
    }
  }, [slug, band[0], band[1], isFavorites]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    reload();
  }, [reload]);

  async function doReset(scope: 'all' | 'lapsed') {
    const n = await resetSrs(slug, scope);
    setConfirm(null);
    setNote(`${n.toLocaleString('de-DE')} Karten zurückgesetzt — sie gelten wieder als neu.`);
    await reload();
    onChanged();
  }

  async function doRemove() {
    if (isFavorites) await clearFavorites();
    else await deactivateOpening(slug);
    onChanged();
    onBack();
  }

  async function unfavorite(id: string) {
    await toggleFavorite(id);
    await reload();
    onChanged();
  }

  return (
    <div className="screen">
      <header className="topbar">
        <button className="ghost" onClick={onBack}>
          ← Zurück
        </button>
        <h1>{name}</h1>
        <span />
      </header>

      {stats && (
        <div className="statgrid">
          <Stat label="fällig" value={stats.due_count} accent="due" />
          <Stat
          label={isFavorites ? 'neu' : 'neu im Bereich'}
          value={stats.new_in_band}
          accent="new"
        />
          <Stat label="im Lernen" value={stats.learning + stats.relearning} />
          <Stat label="gefestigt" value={stats.review} />
          <Stat label="heute geübt" value={stats.reviews_today} />
          <Stat label="Patzer gesamt" value={stats.lapses} />
        </div>
      )}

      {!isFavorites && (
        <div className="difficulty">
          <span className="muted small">Schwierigkeit neuer Puzzle</span>
          <div className="chips">
            {DIFFICULTIES.map((d) => (
              <button
                key={d.id}
                className={`chip ${settings.difficulty === d.id ? 'on' : ''}`}
                title={d.hint}
                onClick={() => onSettings({ ...settings, difficulty: d.id })}
              >
                {d.label}
              </button>
            ))}
            {settings.difficulty === 'custom' && (
              <button className="chip on" title="in den Einstellungen festgelegt">
                {settings.ratingMin}–{settings.ratingMax}
              </button>
            )}
          </div>
          <span className="muted small">
            Gilt nur für neue Puzzle. Fällige Wiederholungen kommen unabhängig davon
            zurück — einmal Gelerntes verschwindet nicht, wenn du die Stufe wechselst.
          </span>
        </div>
      )}

      {/* Kein Stapel: die Sitzung holt ein Puzzle nach dem anderen, jede
          Bewertung ist sofort gespeichert, Beenden geht jederzeit. */}
      <button
        className="mode primary"
        disabled={!stats || (stats.due_count === 0 && stats.new_in_band === 0)}
        onClick={() =>
          onStart({
            mode: 'mix',
            ratingMin: band[0],
            ratingMax: band[1],
            newPerDay,
          })
        }
      >
        <b>Üben</b>
        <span>
          {stats
            ? `${stats.due_count.toLocaleString('de-DE')} fällig, dann bis zu ${newPerDay} neue am Tag`
            : '…'}
          {stats && stats.new_in_band > 0 && !isFavorites && ` · ${difficultyLabel(settings)}`}
          {' · '}einzeln, jederzeit beenden
        </span>
      </button>
      <div className="modes">
        <button
          className="mode"
          disabled={!stats || stats.due_count === 0}
          onClick={() => onStart({ mode: 'due' })}
        >
          <b>Nur fällige</b>
          <span>{stats ? `${stats.due_count.toLocaleString('de-DE')} fällig` : '…'}</span>
        </button>
        <button
          className="mode"
          disabled={!stats || stats.new_in_band === 0}
          onClick={() => onStart({ mode: 'new', ratingMin: band[0], ratingMax: band[1] })}
        >
          <b>Nur neue</b>
          <span>
            {stats ? `${stats.new_in_band.toLocaleString('de-DE')} verfügbar` : '…'}
            {' · '}ohne Tagesgrenze
          </span>
        </button>
      </div>

      <details className="panel">
        <summary>Freie Sitzung — nur bestimmte Puzzle</summary>
        <p className="muted">
          Geht in zufälliger Reihenfolge durch beliebige Puzzle dieser Eröffnung,
          unabhängig davon, wann sie fällig wären — so lange du willst. Jede Bewertung
          zählt sofort ganz normal für die Wiederholung.
        </p>
        <div className="fields">
          <label>
            Rating ab
            <input
              type="number"
              value={ratingMin}
              min={400}
              max={3200}
              step={50}
              onChange={(e) => setRatingMin(Number(e.target.value))}
            />
          </label>
          <label>
            bis
            <input
              type="number"
              value={ratingMax}
              min={400}
              max={3200}
              step={50}
              onChange={(e) => setRatingMax(Number(e.target.value))}
            />
          </label>
          <label>
            Motiv
            <select value={theme} onChange={(e) => setTheme(e.target.value)}>
              {THEMES.map(([v, l]) => (
                <option key={v} value={v}>
                  {l}
                </option>
              ))}
            </select>
          </label>
        </div>
        <button
          onClick={() =>
            onStart({
              mode: 'free',
              ratingMin,
              ratingMax,
              theme: theme || null,
            })
          }
        >
          Sitzung starten
        </button>
      </details>

      {related.length > 0 && (
        <div className="panel hint">
          <p>
            <strong>Verwandte Eröffnungen</strong> — Lichess führt diese getrennt, sie sind
            hier also noch nicht dabei:
          </p>
          {related.map((r) => (
            <div key={r.slug} className="related-row">
              <span>
                {r.name} <span className="muted">· {r.count.toLocaleString('de-DE')} Puzzle</span>
              </span>
              <button
                className="ghost"
                onClick={async () => {
                  await activateOpening(r.slug);
                  await reload();
                  onChanged();
                }}
              >
                hinzufügen
              </button>
            </div>
          ))}
        </div>
      )}

      {isFavorites && favs && favs.length > 0 && (
        <details className="panel">
          <summary>Gemerkte Puzzle ansehen ({favs.length.toLocaleString('de-DE')})</summary>
          <ul className="favlist">
            {favs.map((p) => (
              <li key={p.id}>
                <button className="favlist-open" onClick={() => onStudy(p)} title="Variantenbaum öffnen">
                  <b>{p.rating}</b>{' '}
                  <span className="muted small">{p.name}</span>
                  {p.has_study && <span className="tree-mark" title="hat eigene Varianten">⑂ Varianten</span>}
                </button>
                <button
                  className="heart on"
                  onClick={() => unfavorite(p.id)}
                  title="Merkung aufheben"
                >
                  ♥
                </button>
              </li>
            ))}
          </ul>
        </details>
      )}

      <details className="panel danger">
        <summary>Fortschritt zurücksetzen</summary>
        {note && <p className="ok">{note}</p>}
        <p className="muted">
          Das Übungsprotokoll bleibt in jedem Fall erhalten — zurückgesetzt wird nur der
          Wiederholungsplan.
        </p>
        <div className="reset-row">
          <button className="ghost" onClick={() => setConfirm('lapsed')}>
            Nur Patzer zurücksetzen
          </button>
          <button className="ghost" onClick={() => setConfirm('all')}>
            Alles zurücksetzen
          </button>
          <button className="ghost" onClick={() => setConfirm('remove')}>
            {isFavorites ? 'Alle Merkungen aufheben' : 'Eröffnung entfernen'}
          </button>
        </div>
        {confirm && (
          <div className="confirm">
            <p>
              {confirm === 'all' &&
                'Alle Karten dieser Eröffnung gelten danach wieder als neu. Sicher?'}
              {confirm === 'lapsed' &&
                'Alle Karten, bei denen du schon einmal danebengelegen hast, gelten wieder als neu. Sicher?'}
              {confirm === 'remove' &&
                (isFavorites
                  ? 'Alle Merkungen aufheben. Der Lernfortschritt der Puzzle bleibt erhalten, sie verschwinden nur aus diesem Ordner. Sicher?'
                  : 'Eröffnung von der Startseite entfernen. Bereits gelernte Karten bleiben erhalten, falls du sie später wieder hinzufügst. Sicher?')}
            </p>
            <button onClick={() => (confirm === 'remove' ? doRemove() : doReset(confirm))}>
              Ja, ausführen
            </button>
            <button className="ghost" onClick={() => setConfirm(null)}>
              Abbrechen
            </button>
          </div>
        )}
      </details>
    </div>
  );
}

function Stat({ label, value, accent }: { label: string; value: number; accent?: string }) {
  return (
    <div className="stat">
      <span className={`stat-value ${accent ?? ''}`}>{value.toLocaleString('de-DE')}</span>
      <span className="stat-label">{label}</span>
    </div>
  );
}
