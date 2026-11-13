#!/bin/sh
# Xcode Cloud runs this after cloning the repository and before resolving packages.
# The Capacitor Swift packages are referenced from node_modules by relative path, so
# a fresh clone cannot resolve them until dependencies are installed. Installing with
# --ignore-scripts skips Prisma generation, which needs a database URL that an iOS
# build does not have; the patch script below is then run explicitly.
set -e

cd "$CI_PRIMARY_REPOSITORY_PATH"

if ! command -v npm >/dev/null 2>&1; then
  echo "npm not found, installing Node with Homebrew"
  brew install node
fi

npm ci --ignore-scripts --no-audit --no-fund
node scripts/fix-apple-sign-in-plugin.mjs
# Xcode Cloud disables automatic package resolution, so the resolved file must match
# the patched manifests before validation runs.
xcodebuild -resolvePackageDependencies -project ios/App.xcodeproj -scheme App

echo "ci_post_clone: dependencies installed, plugin patched, packages resolved"
