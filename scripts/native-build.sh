#!/usr/bin/env bash
set -euo pipefail
task="${1:-}"
case "$task" in
  android-debug|android-unsigned|ios-simulator) ;;
  *) echo 'Usage: bash scripts/native-build.sh android-debug|android-unsigned|ios-simulator' >&2; exit 2 ;;
esac
task_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$task_root"
node scripts/native-preflight.mjs
test -d node_modules || { echo 'Run npm ci first.' >&2; exit 1; }
# Apply explicitly too, for installations that disable npm lifecycle scripts.
node scripts/fix-apple-sign-in-plugin.mjs
mkdir -p .native-artifacts
case "$task" in
  android-*)
    : "${JAVA_HOME:?Set JAVA_HOME to a supported JDK (validated with Java 21).}"
    : "${ANDROID_HOME:?Set ANDROID_HOME to the Android SDK directory.}"
    export ANDROID_SDK_ROOT="$ANDROID_HOME"
    export PATH="$JAVA_HOME/bin:$PATH"
    npx cap sync android
    if [[ "$task" == android-debug ]]; then
      (cd android && ./gradlew --no-daemon assembleDebug -PdatalystUnsignedRelease=true)
      cp android/app/build/outputs/apk/debug/app-debug.apk .native-artifacts/datalyst-debug.apk
    else
      # Explicitly ignores key.properties even if the checkout contains one.
      (cd android && ./gradlew --no-daemon bundleRelease -PdatalystUnsignedRelease=true)
      cp android/app/build/outputs/bundle/release/app-release.aab .native-artifacts/datalyst-unsigned.aab
    fi
    ;;
  ios-simulator)
    [[ "$(uname -s)" == Darwin ]] || { echo 'iOS Simulator build requires macOS and Xcode.' >&2; exit 1; }
    command -v asc >/dev/null || { echo 'Install asc CLI first.' >&2; exit 1; }
    npx cap sync ios
    # The nested App/App.xcodeproj is legacy and lacks the widget/bridge targets.
    asc xcode build --project ios/App.xcodeproj --scheme App --configuration Debug \
      --destination 'generic/platform=iOS Simulator' --no-code-signing \
      --derived-data-path "$task_root/.native-artifacts/ios-derived-data" --output json
    ;;
esac
echo 'Validation artifact only. The shell loads the live HTTPS site; production rollout is still held. No store action performed.'
