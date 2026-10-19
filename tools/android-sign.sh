#!/bin/bash
# Richtet Signatur und Android-Startcode fuer den Release-Build ein.
#
# src-tauri/gen/android ist von Tauri generiert und bewusst ignoriert.
# Dieses Skript ist deshalb die reproduzierbare Quelle dafuer, wie das
# generierte Projekt nach `tauri android init` aussehen muss.
#
#   ./tools/android-sign.sh

set -euo pipefail
cd "$(dirname "$0")/.."

# keytool liegt im JDK aus Android Studio.
# shellcheck source=/dev/null
. tools/android-env.sh

KEYDIR="$HOME/.android"
KEYSTORE="$KEYDIR/woodrooster-release.jks"
PASSFILE="$KEYDIR/woodrooster-release.pass"
ALIAS="woodrooster"
GRADLE="src-tauri/gen/android/app/build.gradle.kts"
PROPS="src-tauri/gen/android/keystore.properties"
MAIN_ACTIVITY="src-tauri/gen/android/app/src/main/java/de/leidenschaftlicheslernen/woodrooster/MainActivity.kt"
MAIN_ACTIVITY_TEMPLATE="tools/android/MainActivity.kt"
SIGNING_MARKER="WOODROOSTER_RELEASE_SIGNING"

if [ ! -f "$GRADLE" ]; then
  echo "Kein Android-Projekt gefunden. Erst ausfuehren:" >&2
  echo "  source tools/android-env.sh && npm run tauri android init" >&2
  exit 1
fi
if [ ! -f "$MAIN_ACTIVITY_TEMPLATE" ]; then
  echo "Fehlende Vorlage: $MAIN_ACTIVITY_TEMPLATE" >&2
  exit 1
fi

umask 077
mkdir -p "$KEYDIR"

# --- Schluessel ---
if [ -f "$KEYSTORE" ]; then
  echo "Schluessel vorhanden: $KEYSTORE"
else
  echo "Erzeuge Schluessel: $KEYSTORE"
  # Zufaelliges Passwort; der Schluessel liegt bewusst ausserhalb des Projekts.
  openssl rand -hex 24 > "$PASSFILE"
  chmod 600 "$PASSFILE"

  keytool -genkeypair -v \
    -keystore "$KEYSTORE" \
    -alias "$ALIAS" \
    -keyalg RSA -keysize 4096 -validity 10000 \
    -storepass "$(cat "$PASSFILE")" \
    -keypass "$(cat "$PASSFILE")" \
    -dname "CN=WoodRooster, OU=Privat, O=Privat, C=DE" >/dev/null
  chmod 600 "$KEYSTORE"

  echo
  echo "  WICHTIG: $KEYSTORE und $PASSFILE sichern."
  echo "  Ohne diesen Schluessel laesst sich eine spaetere Version der App nicht"
  echo "  ueber die installierte drueberspielen - Android verweigert das dann."
  echo
fi

if [ ! -f "$PASSFILE" ]; then
  echo "Schluesselpasswort fehlt: $PASSFILE" >&2
  exit 1
fi

STORE_PASSWORD="$(tr -d '\r\n' < "$PASSFILE")"
if ! keytool -list -keystore "$KEYSTORE" -storepass "$STORE_PASSWORD" >/dev/null 2>&1; then
  echo "Der vorhandene Schluessel passt nicht zum Passwort in $PASSFILE." >&2
  exit 1
fi

# --- keystore.properties ---
# Diese Datei liegt im ignorierten generierten Projekt und bleibt lokal.
cat > "$PROPS" <<PROPEOF
storeFile=$KEYSTORE
keyAlias=$ALIAS
storePassword=$STORE_PASSWORD
keyPassword=$STORE_PASSWORD
PROPEOF
chmod 600 "$PROPS"
echo "Geschrieben: $PROPS"

# --- Gradle-Signatur ---
# Der alte Setup-Code hatte noch keinen Marker. `keystore.properties` ist eine
# hinreichende Erkennung dafuer, damit ein bestehendes Projekt nicht doppelt
# gepatcht wird.
if grep -q "$SIGNING_MARKER" "$GRADLE" || grep -q 'keystore.properties' "$GRADLE"; then
  echo "Gradle-Signatur ist bereits eingerichtet."
else
  python3 - "$GRADLE" <<'PYEOF'
import io
import sys

path = sys.argv[1]
s = io.open(path, encoding="utf-8").read()

if 'import java.util.Properties' not in s:
    s = 'import java.util.Properties\n\n' + s

loader = '''// WOODROOSTER_RELEASE_SIGNING
// Signatur fuer das Release-APK, eingerichtet von tools/android-sign.sh.
val keystoreProperties = Properties().apply {
    val f = rootProject.file("keystore.properties")
    if (f.exists()) f.inputStream().use { load(it) }
}

'''
android_anchor = 'android {\n'
if android_anchor not in s:
    raise SystemExit('android-Block nicht gefunden; Gradle-Datei wurde nicht angepasst.')
s = s.replace(android_anchor, loader + android_anchor, 1)

signing = '''    signingConfigs {
        create("release") {
            if (keystoreProperties.containsKey("storeFile")) {
                storeFile = file(keystoreProperties["storeFile"] as String)
                storePassword = keystoreProperties["storePassword"] as String
                keyAlias = keystoreProperties["keyAlias"] as String
                keyPassword = keystoreProperties["keyPassword"] as String
            }
        }
    }
    buildTypes {
'''
build_types_anchor = '    buildTypes {\n'
if build_types_anchor not in s:
    raise SystemExit('buildTypes-Block nicht gefunden; Gradle-Datei wurde nicht angepasst.')
s = s.replace(build_types_anchor, signing, 1)

release_anchor = '''        getByName("release") {
            isMinifyEnabled = true'''
release_replacement = '''        getByName("release") {
            signingConfig = signingConfigs.getByName("release")
            isMinifyEnabled = true'''
if release_anchor not in s:
    raise SystemExit('Release-Buildtyp nicht gefunden; Gradle-Datei wurde nicht angepasst.')
s = s.replace(release_anchor, release_replacement, 1)

io.open(path, mode="w", encoding="utf-8").write(s)
print('Gradle-Konfiguration ergaenzt.')
PYEOF
fi

# --- MainActivity ---
# Diese Datei wird immer auf die getrackte Vorlage gebracht. Damit werden auch
# alte, kaputte Versionen nach einem erneuten `tauri android init` repariert.
mkdir -p "$(dirname "$MAIN_ACTIVITY")"
if cmp -s "$MAIN_ACTIVITY_TEMPLATE" "$MAIN_ACTIVITY"; then
  echo "MainActivity ist bereits aktuell."
else
  cp "$MAIN_ACTIVITY_TEMPLATE" "$MAIN_ACTIVITY"
  echo "MainActivity aktualisiert: $MAIN_ACTIVITY"
fi

echo "Android-Release-Setup abgeschlossen."
