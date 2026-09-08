# Umgebung fuer den Android-Build. Vor dem Bauen einlesen:
#   source tools/android-env.sh
#
# Geprueft auf diesem Rechner: SDK android-36.1, NDK 28.2.13676358,
# JBR 21 aus Android Studio.

export ANDROID_HOME="$HOME/Library/Android/sdk"
export NDK_HOME="$ANDROID_HOME/ndk/28.2.13676358"

# Gradle laeuft mit dem JDK 21 aus Android Studio. Das System-JDK 26 ist fuer
# das Android Gradle Plugin zu neu.
export JAVA_HOME="/Applications/Android Studio.app/Contents/jbr/Contents/Home"

# rustup muss vor dem Homebrew-Rust liegen - nur rustup kennt die
# Android-Targets.
export PATH="$HOME/.cargo/bin:$JAVA_HOME/bin:$ANDROID_HOME/platform-tools:$PATH"

if [ ! -d "$NDK_HOME" ]; then
  echo "Warnung: NDK nicht unter $NDK_HOME gefunden." >&2
  echo "Vorhandene Versionen: $(ls "$ANDROID_HOME/ndk" 2>/dev/null | tr '\n' ' ')" >&2
fi
