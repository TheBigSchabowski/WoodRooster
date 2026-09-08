# Credits / Danksagung

## 🇬🇧 English

### Lichess — without them, this app would not exist

Everything that makes this app work with chess comes from
[Lichess](https://lichess.org):

- **[The puzzle database](https://database.lichess.org/#puzzles)** — 6.1 million
  rated and tagged puzzles, released under **CC0**. Every puzzle in this app,
  including its verified solution, opening tag and rating, comes from there.
- **[chessground](https://github.com/lichess-org/chessground)** — the chess board
  itself, the same one Lichess uses.
- **[chessops](https://github.com/lichess-org/chessops)** — move generation and
  FEN/UCI handling.
- **[The puzzle API](https://lichess.org/api)** — used to look up the original
  game behind a puzzle.

Lichess is free, open source, ad-free and has no paywall of any kind. It is run
by a non-profit and funded entirely by donations. If this app is useful to you,
the people who actually earned that are over there — please consider
[becoming a Patron](https://lichess.org/patron).

### Spaced repetition

- **[ts-fsrs](https://github.com/open-spaced-repetition/ts-fsrs)** by
  [Open Spaced Repetition](https://github.com/open-spaced-repetition) (MIT) —
  the implementation of **FSRS**, the Free Spaced Repetition Scheduler. It is
  the same algorithm family [Anki](https://apps.ankiweb.net/) has used since
  version 23.10, and the reason the intervals under the grading buttons are real
  numbers rather than guesses.

### Built with

[Tauri](https://tauri.app) · [React](https://react.dev) ·
[Vite](https://vite.dev) · [rusqlite](https://github.com/rusqlite/rusqlite) ·
[zstd](https://github.com/facebook/zstd)

### AI assistance — stated plainly

This app was written **in large part by Claude Opus** (Anthropic) over a series
of interactive sessions. The split of work was roughly:

- **The human** set every requirement and made every product decision: which
  openings, real `.dmg` and `.apk` instead of a web wrapper, Anki-style manual
  grading, the favourites folder, the `Y X C V` key layout, the difficulty
  levels.
- **The model** did the research, architecture, implementation, tests and
  packaging — including finding the traps documented in the README (the silently
  ignored Lichess API parameter, the wrong Jobava slug, the seekable-zstd
  format) and two runtime bugs it had introduced itself.

This is stated because it should be visible rather than quietly omitted. Judge
the code on its merits, not on who typed it — but know who typed it.

---

## 🇩🇪 Deutsch

### Lichess — ohne sie gäbe es diese App nicht

Alles, was diese App überhaupt zu einer Schach-App macht, stammt von
[Lichess](https://lichess.org):

- **[Die Puzzledatenbank](https://database.lichess.org/#puzzles)** — 6,1 Millionen
  bewertete und verschlagwortete Puzzle unter **CC0**. Jedes Puzzle in dieser
  App, samt geprüfter Lösung, Eröffnungs-Tag und Rating, kommt von dort.
- **[chessground](https://github.com/lichess-org/chessground)** — das Schachbrett
  selbst, dasselbe, das Lichess benutzt.
- **[chessops](https://github.com/lichess-org/chessops)** — Zugerzeugung und
  FEN/UCI-Verarbeitung.
- **[Die Puzzle-API](https://lichess.org/api)** — um die Originalpartie hinter
  einem Puzzle nachzuschlagen.

Lichess ist kostenlos, quelloffen, werbefrei und hat keinerlei Bezahlschranke.
Dahinter steht ein gemeinnütziger Verein, finanziert allein durch Spenden. Wenn
dir diese App etwas bringt: Verdient haben das eigentlich die dort drüben — sieh
dir an, ob du [Patron werden](https://lichess.org/patron) magst.

### Spaced Repetition

- **[ts-fsrs](https://github.com/open-spaced-repetition/ts-fsrs)** von
  [Open Spaced Repetition](https://github.com/open-spaced-repetition) (MIT) —
  die Umsetzung von **FSRS**, dem Free Spaced Repetition Scheduler. Dieselbe
  Algorithmusfamilie, die [Anki](https://apps.ankiweb.net/) seit Version 23.10
  benutzt, und der Grund dafür, dass die Intervalle unter den Bewertungsknöpfen
  echte Werte sind und keine Schätzung.

### Gebaut mit

[Tauri](https://tauri.app) · [React](https://react.dev) ·
[Vite](https://vite.dev) · [rusqlite](https://github.com/rusqlite/rusqlite) ·
[zstd](https://github.com/facebook/zstd)

### KI-Beteiligung — offen gesagt

Diese App wurde **maßgeblich von Claude Opus** (Anthropic) geschrieben, über
mehrere zusammenhängende Sitzungen hinweg. Die Arbeitsteilung war ungefähr so:

- **Der Mensch** hat jede Anforderung gestellt und jede Produktentscheidung
  getroffen: welche Eröffnungen, echte `.dmg` und `.apk` statt einer
  Web-Verpackung, Anki-artige manuelle Bewertung, der Ordner für gemerkte
  Puzzle, die Tastenbelegung `Y X C V`, die Schwierigkeitsstufen.
- **Das Modell** hat recherchiert, entworfen, implementiert, getestet und
  verpackt — einschließlich der Fallstricke, die im README dokumentiert sind
  (der stillschweigend ignorierte Lichess-API-Parameter, der falsche
  Jobava-Slug, das Seekable-zstd-Format) und zweier Laufzeitfehler, die es
  selbst eingebaut hatte.

Das steht hier, weil es sichtbar sein soll statt stillschweigend zu fehlen.
Beurteile den Code danach, was er taugt, nicht danach, wer ihn getippt hat —
aber wisse, wer ihn getippt hat.

---

## Lizenz / License

Diese App steht unter **GPL-3.0-or-later**, weil `chessground` und `chessops`
unter dieser Lizenz stehen. Siehe [LICENSE](LICENSE).

This app is licensed under **GPL-3.0-or-later**, because `chessground` and
`chessops` are. See [LICENSE](LICENSE).

Die Puzzledaten selbst sind **CC0** (gemeinfrei) und stammen von Lichess.
The puzzle data itself is **CC0** (public domain) and comes from Lichess.
