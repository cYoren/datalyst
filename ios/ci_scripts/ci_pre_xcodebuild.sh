#!/bin/bash
#
# Xcode Cloud, step 2: build numbers for the store.
#
# App Store Connect wants a build number that never repeats for a version, and the widget
# extension must carry the same one as the app. Xcode Cloud provides a monotonically
# increasing CI_BUILD_NUMBER, so the committed number (native-version.json, for local
# builds) is not used on CI. MARKETING_VERSION stays as committed; bump it with a PR.

set -euo pipefail

if [ -z "${CI_BUILD_NUMBER:-}" ]; then
    echo "ci_pre_xcodebuild: no CI_BUILD_NUMBER, keeping the committed build number"
    exit 0
fi

cd "${CI_PRIMARY_REPOSITORY_PATH:-$(cd "$(dirname "$0")/.." && pwd)}/ios"
# -all covers the app and the TodayWidget extension: a widget whose CFBundleVersion differs
# is rejected at upload.
agvtool new-version -all "$CI_BUILD_NUMBER" >/dev/null
echo "ci_pre_xcodebuild: build number set to $CI_BUILD_NUMBER"
