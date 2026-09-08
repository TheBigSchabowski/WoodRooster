#!/bin/bash
# Richtet die Signatur fuer das Release-APK ein.
#
# Android installiert nur signierte APKs. Fuer den Eigenbedarf genuegt ein
# selbst erzeugter Schluessel; Google Play waere etwas anderes.
#
# Das Skript ist wiederholbar: es erzeugt den Schluessel nur beim ersten Mal und
# haengt die Gradle-Konfiguration nur an, wenn sie noch fehlt. Nach einem
# erneuten `tauri android init` einfach nochmal laufen lassen.
#
#   ./tools/android-sign.sh

set -euo pipefail
cd "$(dirname "$0")/.."

# keytool liegt im JDK aus Android Studio.
# shellcheck source=/dev/null
. tools/android-env.sh

KEYDIR="$HOME/.android"
KEYSTORE="$KEYDIR/schachtrainer-release.jks"
PASSFILE="$KEYDIR/schachtrainer-release.pass"
ALIAS="schachtrainer"
GRADLE="src-tauri/gen/android/app/build.gradle.kts"
PROPS="src-tauri/gen/android/keystore.properties"

if [ ! -f "$GRADLE" ]; then
  echo "Kein Android-Projekt gefunden. Erst ausfuehren:" >&2
  echo "  source tools/android-env.sh && npm run tauri android init" >&2
  exit 1
fi

mkdir -p "$KEYDIR"

# --- Schluessel ---
if [ -f "$KEYSTORE" ]; then
  echo "Schluessel vorhanden: $KEYSTORE"
else
  echo "Erzeuge Schluessel: $KEYSTORE"
  # Zufaelliges Passwort; der Schluessel liegt bewusst ausserhalb des Projekts.
  # Ohne Pipe erzeugt - `... | head -c 32` loest unter `set -o pipefail` SIGPIPE aus.
  openssl rand -hex 24 > "$PASSFILE"
  chmod 600 "$PASSFILE"

  keytool -genkeypair -v \
    -keystore "$KEYSTORE" \
    -alias "$ALIAS" \
    -keyalg RSA -keysize 4096 -validity 10000 \
    -storepass "$(cat "$PASSFILE")" \
    -keypass "$(cat "$PASSFILE")" \
    -dname "CN=Schachtrainer, OU=Privat, O=Privat, C=DE" >/dev/null
  chmod 600 "$KEYSTORE"

  echo
  echo "  WICHTIG: $KEYSTORE und $PASSFILE sichern."
  echo "  Ohne diesen Schluessel laesst sich eine spaetere Version der App nicht"
  echo "  ueber die installierte druebersetzen - Android verweigert das dann."
  echo
fi

# --- keystore.properties ---
cat > "$PROPS" <<PROPEOF
storeFile=$KEYSTORE
keyAlias=$ALIAS
storePassword=$(cat "$PASSFILE")
keyPassword=$(cat "$PASSFILE")
PROPEOF
chmod 600 "$PROPS"
echo "Geschrieben: $PROPS"

# --- Gradle ---
if grep -q 'keystore.properties' "$GRADLE"; then
  echo "Gradle ist bereits eingerichtet."
  exit 0
fi

python3 - "$GRADLE" <<'PYEOF'
import io, sys
p = sys.argv[1]
s = io.open(p, encoding='utf-8').read()

load = '''
// Signatur fuer das Release-APK, eingerichtet von tools/android-sign.sh.
val keystoreProperties = Properties().apply {
    val f = rootProject.file("keystore.properties")
    if (f.exists()) f.inputStream().use { load(it) }
}

'''
anchor = 'android {\n'
assert anchor in s
s = s.replace(anchor, load + anchor, 1)

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
assert '    buildTypes {\n' in s
s = s.replace('    buildTypes {\n', signing, 1)

old_release = '''        getByName("release") {
            isMinifyEnabled = true'''
new_release = '''        getByName("release") {
            signingConfig = signingConfigs.getByName("release")
            isMinifyEnabled = true'''
assert old_release in s
s = s.replace(old_release, new_release, 1)

io.open(p, 'w', encoding='utf-8').write(s)
print('Gradle-Konfiguration ergaenzt.')
PYEOF
