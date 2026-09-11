# Schachtrainer

Chess puzzles grouped by opening, drilled with spaced repetition. Native desktop
app (macOS `.dmg`) and Android app (`.apk`) from one Tauri codebase.

> **The documentation below is in German** — it is a personal project. This
> section is the short English version.
>
> **What it does.** You pick chess openings (Queen's Gambit Accepted, Trompowsky,
> Rapport-Jobava, or any of ~1,600 others). The app drills their puzzles using
> **FSRS**, the same scheduling algorithm Anki has used since 23.10, with
> Anki-style manual grading. Puzzles you like go into a favourites folder with a
> keypress. All 1.2 million opening-tagged Lichess puzzles are **bundled
> offline** in a 39 MB pack, so adding a new opening works on a plane.
>
> **Privacy.** All learning progress lives in a local SQLite file and is never
> sent anywhere. The app touches the network only when you tap "view game" on a
> solved puzzle.
>
> **Downloads.** Ready-to-install packages are available on the [Releases page](https://github.com/TheBigSchabowski/schachtrainer/releases/latest):
> - [Android APK (arm64)](https://github.com/TheBigSchabowski/schachtrainer/releases/latest/download/Schachtrainer_0.1.4_android-arm64.apk)
> - [macOS DMG (Apple Silicon)](https://github.com/TheBigSchabowski/schachtrainer/releases/latest/download/Schachtrainer_0.1.4_macos-arm64.dmg)
>
> **Credits, including AI assistance:** see **[CREDITS.md](CREDITS.md)**.
> **License:** GPL-3.0-or-later, see [LICENSE](LICENSE).

Lichess-Puzzle nach Eröffnung, geübt mit Spaced Repetition (FSRS — derselbe
Algorithmus, den Anki seit 23.10 verwendet).

Der gesamte Lernfortschritt liegt in einer SQLite-Datei auf dem Gerät und wird
nirgendwohin gesendet. Ins Netz geht die App nur, wenn man bei einem gelösten
Puzzle „Partie ansehen“ antippt.

Dank, Lizenz und die Rolle der KI-Beteiligung: **[CREDITS.md](CREDITS.md)**.

## Download (Fertige Apps)

Fertig gebaute Installationsdateien können direkt heruntergeladen werden — kein Terminal, kein Termux und kein manuelles Kompilieren nötig:

| Plattform | Download | Details |
|---|---|---|
| **Android** | [`.apk` herunterladen (v0.1.4)](https://github.com/TheBigSchabowski/schachtrainer/releases/latest/download/Schachtrainer_0.1.4_android-arm64.apk) | Android 7.0+ (arm64, selbstsigniert) |
| **macOS** | [`.dmg` herunterladen (v0.1.4)](https://github.com/TheBigSchabowski/schachtrainer/releases/latest/download/Schachtrainer_0.1.4_macos-arm64.dmg) | Apple Silicon (M1 und neuer) |

Alle Versionen und Prüfsummen finden sich unter **[Releases](https://github.com/TheBigSchabowski/schachtrainer/releases)**.

**Hinweise zur Installation:**
- **Android:** Das APK im Browser auf dem Smartphone herunterladen und öffnen. Bei der Abfrage „Aus dieser Quelle installieren“ bzw. unbekannte Quellen die Erlaubnis für den Browser oder Dateimanager erteilen.
- **macOS:** DMG öffnen und die App in den Programme-Ordner ziehen. Da die App als Hobbyprojekt nicht mit einem kostenpflichtigen Apple-Entwicklerzertifikat signiert ist, beim ersten Start: Rechtsklick auf die App → **Öffnen** → **Öffnen** bestätigen.

## Starten und bauen (Entwicklung)

```sh
npm install
npm run build-pack        # einmalig, siehe unten
npm run tauri dev         # zum Entwickeln
npm run tauri build       # erzeugt .app und .dmg
```

Für Android:

```sh
source tools/android-env.sh
npm run tauri android init      # einmalig
./tools/android-sign.sh         # richtet Signatur und Android-Startcode ein
npm run android                 # erzeugt das .apk für arm64
```

Android installiert nur signierte APKs, deshalb der Schritt mit
`android-sign.sh`. Das Skript legt einen selbst erzeugten Schlüssel unter
`~/.android/schachtrainer-release.jks` ab (bewusst außerhalb des Projekts) und
trägt ihn in die Gradle-Konfiguration ein. Es ist wiederholbar — nach einem
erneuten `android init` einfach nochmal laufen lassen.

**Den Schlüssel sichern.** Geht er verloren, lässt sich eine neuere Version der
App nicht mehr über die installierte drüberspielen; Android verweigert das dann
und man muss erst deinstallieren, was den Lernfortschritt mitnimmt.

APK aufs Handy (USB-Debugging aktiviert):

```sh
adb install -r src-tauri/gen/android/app/build/outputs/apk/universal/release/*.apk
```

Beide fertigen Installationsdateien auf einmal (nach einmaligem Android-Setup):

```sh
npm run build:all
```

Das Skript baut DMG und APK, benennt sie für die Releases um und erzeugt
`dist/releases/SHA256SUMS.txt`.

## Bedienung während einer Sitzung

| Taste | Wirkung |
|---|---|
| `Y` | Einfach |
| `X` | Gut |
| `C` | Schwer |
| `V` | Nochmal |
| `1`–`4` | dasselbe in Knopfreihenfolge (Nochmal … Einfach) |
| Leertaste | Gut |
| `F` | Puzzle merken, geht auch während des Lösens |

Die Belegung ist auf die **deutsche QWERTZ-Tastatur** gemünzt: dort liegen
Y X C V nebeneinander unten links. Ausgewertet wird `KeyboardEvent.key`, also
das erzeugte Zeichen — nicht `.code`, das die physische Position nach US-Layout
meldet und „Einfach" auf der Z-Taste landen ließe.

Die linke Hand liegt auf YXCV, von gut nach schlecht. Die Knopfreihenfolge auf
dem Bildschirm bleibt die von Anki gewohnte (Nochmal … Einfach), die Buchstaben
laufen also über die Leiste von rechts nach links — auf jedem Knopf steht der
zugehörige Buchstabe. Umdrehen ließe sich das in `GRADE_KEY`
(`src/srs/scheduler.ts`); `tools/test-keys.mjs` hält die Belegung fest.

## Schwierigkeit

Fünf Stufen, umschaltbar direkt auf der Eröffnungsseite und in den
Einstellungen: Alle, Leicht (bis 1200), Mittel (1200–1800), Schwer (1800–2200),
Sehr schwer (ab 2200), dazu ein eigener Bereich. Vorgabe ist Mittel.

Die Stufe gilt **nur für neue Puzzle**. Fällige Wiederholungen kommen unabhängig
davon zurück — einmal Gelerntes verschwindet nicht, wenn die Stufe wechselt. Im
Ordner der gemerkten Puzzle gilt sie gar nicht.

## Gemerkte Puzzle

In einer Sitzung schaltet das Herz neben dem Rating (oder die Taste `f`) ein
Puzzle zum Merken frei. Alle gemerkten landen im Ordner **Gemerkte Puzzle** auf
der Startseite — quer über alle Eröffnungen hinweg — und lassen sich dort
genauso üben wie eine Eröffnung: Neu, Wiederholen, freie Sitzung, zurücksetzen.

Zwei Entscheidungen dahinter:

- Die Markierung liegt in einer **eigenen Tabelle**, nicht als Spalte in
  `puzzle`. So übersteht sie das Entfernen und erneute Hinzufügen einer
  Eröffnung. Das Aufräumen beim Entfernen einer Eröffnung verschont gemerkte
  Puzzle ausdrücklich, sonst wäre der Ordner mit ihr verschwunden.
- Der Rating-Bereich aus den Einstellungen gilt im Ordner **nicht**. Er soll
  große Eröffnungen bändigen; auf eine handverlesene Sammlung angewandt würde er
  nur im Weg stehen — wer ein Puzzle merkt, will es auch üben.

Intern läuft der Ordner über den Pseudo-Slug `@favorites`, der dieselben
Abfragen benutzt wie eine Eröffnung. Ein echter Eröffnungs-Slug enthält nie ein
`@`, Verwechslung ist damit ausgeschlossen.

## Der Puzzle-Pack

`src-tauri/resources/openings.pack` (≈39 MB) enthält **alle 1.214.759 Puzzle der
Lichess-Datenbank, die einen Eröffnungs-Tag tragen** — aufgeteilt in 156
einzeln entpackbare Blöcke, einen je Eröffnungsfamilie. Beim Freischalten einer
Eröffnung wird nur ihr Block entpackt, nie die ganze Datei. Deshalb funktioniert
das Plus-Feld auch ohne Internet.

Erzeugt wird der Pack aus der offiziellen Datenbank (CC0):

```sh
curl -L -o ~/Library/Caches/schachtrainer/lichess_db_puzzle.csv.zst \
  https://database.lichess.org/lichess_db_puzzle.csv.zst
npm run build-pack
```

Der Pack ist bewusst nicht eingecheckt (`.gitignore`); er ist reproduzierbar und
muss nur neu gebaut werden, wenn der Puzzlebestand aufgefrischt werden soll.
Aktueller Stand: Datenbank vom 02.08.2026.

## Was beim Bauen zu beachten war

Drei Dinge, die nicht offensichtlich sind und beim nächsten Mal Zeit sparen:

**Die Lichess-API ignoriert ungültige Eröffnungen stillschweigend.**
`/api/puzzle/next?angle=Unfug` antwortet mit HTTP 200 und liefert einfach
zufällige Puzzle statt eines Fehlers. Beim Üben merkt man das nicht. Deshalb
prüft `resolve_opening` jede Eingabe gegen den mitgelieferten Katalog und
verweigert Unbekanntes ausdrücklich, statt irgendetwas anzuzeigen.

**„Jobava London“ heißt bei Lichess `Rapport-Jobava_System`.** Ein Slug
`Jobava_London_System` existiert nicht — und wäre wegen des Punktes oben
kommentarlos durchgerutscht. Zusätzlich führt Lichess
`Rapport-Jobava_System_with_e6` (495 Puzzle) als *eigene* Familie, nicht als
Variante. Wer nur `Rapport-Jobava_System` aktiviert, verpasst sie also. Darum
zeigt die App verwandte Eröffnungen beim Hinzufügen und auf der
Eröffnungsseite an.

**Die Lichess-Datenbank liegt im zstd-*Seekable*-Format vor.** Sie beginnt mit
einem Skippable Frame und besteht aus 34 Einzelframes; Nodes eingebauter
zstd-Dekomprimierer bricht daran mit „Unknown frame descriptor“ ab. Der
Pack-Builder ruft deshalb das `zstd`-CLI auf (`brew install zstd`).

## Aufbau

```
tools/build-pack.mjs      erzeugt openings.pack + openings.json
tools/make-emoji-icon.m   rendert ein Emoji als Icon-Quelle (siehe unten)
tools/make-icon.mjs       zeichnet stattdessen ein Schachbrett-Icon
tools/test-solve.mjs      spielt echte Puzzle durch, prüft die Abspiel-Logik
tools/android-env.sh      Umgebungsvariablen für den Android-Build

src/board/solve.ts        Abspiel-Logik eines Puzzles
src/srs/scheduler.ts      FSRS-Anbindung, Intervalle für die Bewertungsknöpfe
src/screens/              Start, Eröffnung, Sitzung, Einstellungen

src-tauri/src/pack.rs     liest einen einzelnen Block aus openings.pack
src-tauri/src/db.rs       SQLite-Schema
src-tauri/src/commands.rs Schnittstelle zum Frontend
```

FSRS rechnet bewusst im Frontend: `ts-fsrs` liefert mit einem Aufruf alle vier
Bewertungen samt Folgeintervall — genau das, was unter den Knöpfen steht. Rust
speichert nur das Ergebnis.

**Wichtig an der Abspiel-Logik:** Im Lichess-Format gehört der *erste* Zug in
`moves` dem Gegner. Er wird sofort auf die FEN angewandt, erst danach ist der
Löser am Zug. `tools/test-solve.mjs` prüft das gegen 2.052 echte Puzzle.

## Tests

```sh
npm test
```

Das führt drei Dinge aus:

- `tsc --noEmit` — Typprüfung
- `tools/test-solve.mjs` — spielt 2.052 echte Puzzle aus vier Eröffnungsfamilien
  komplett durch und prüft zusätzlich an 608 Stellen, dass ein falscher Zug auch
  wirklich abgelehnt wird
- `cargo test --lib` — die SQL-Abfragen laufen gegen eine SQLite-Datenbank im
  Speicher, jeder Sitzungsmodus einzeln

Der Test `jeder_modus_bindet_genau_seine_parameter` ist eine Regression: rusqlite
lehnt benannte Parameter ab, die im SQL gar nicht vorkommen. `:now` steht nur in
der Fällig-Abfrage — es versehentlich immer zu binden ließ „Neu“ und „Freie
Sitzung“ zur Laufzeit mit `Invalid parameter name: :now` scheitern, während
„Wiederholen“ weiterlief.

## Icon wechseln

Das App-Icon ist das 🔨-Emoji auf dunklem Grund. Zum Wechseln genügt ein anderes
Emoji:

```sh
clang -framework AppKit -o /tmp/mkicon tools/make-emoji-icon.m
/tmp/mkicon ♞ tools/icon-source.png
npx tauri icon tools/icon-source.png
```

Danach neu bauen. `npx tauri icon` erzeugt daraus alle Größen inklusive der
Android-Mipmaps. Alternativ zeichnet `node tools/make-icon.mjs` das ursprüngliche
Schachbrett-Icon ohne Emoji.

Gerendert wird mit dem echten Systemfont (Apple Color Emoji), damit das Icon
aussieht wie das Emoji überall sonst. In Objective-C statt Swift, weil die
Swift-Version der Command Line Tools hier nicht zum mitgelieferten SDK passt.

## Hinweise

- **Gatekeeper:** Das `.dmg` ist nicht signiert, macOS blockt darum den ersten
  Start. Rechtsklick auf die App → „Öffnen“ genügt. Echtes Signieren bräuchte
  ein Apple-Developer-Konto.
- **Lizenzen:** Die App steht unter **GPL-3.0-or-later**, weil `chessground`
  und `chessops` unter dieser Lizenz stehen und eine Veröffentlichung eine
  Weitergabe ist. `ts-fsrs`, `rusqlite` und `zstd` sind MIT, die
  Puzzledatenbank ist CC0. Siehe [CREDITS.md](CREDITS.md).
