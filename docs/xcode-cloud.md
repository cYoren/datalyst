# Xcode Cloud

Builds for the iOS app run on Xcode Cloud, so nothing depends on a Mac session being open for
signing. The Mac is still there for a quick local build; it is no longer the only path.

## What is already automated in the repo

Both scripts live in `ios/ci_scripts/` — the directory next to `App.xcodeproj`, which is where
Xcode Cloud looks for them.

| Script | Why it exists |
|---|---|
| `ci_post_clone.sh` | The app resolves its Capacitor plugins as **local Swift packages under `node_modules`** (`ios/App/CapApp-SPM/Package.swift`), so a clean checkout cannot resolve the project. Runs `npm ci --ignore-scripts` and the Apple Sign-In package patch, exactly like a local build. |
| `ci_pre_xcodebuild.sh` | `agvtool new-version -all "$CI_BUILD_NUMBER"` for the app **and** the TodayWidget extension. App Store Connect wants a build number that never repeats, and a widget whose `CFBundleVersion` differs from the app is rejected at upload. |

`MARKETING_VERSION` stays as committed (`1.1.0` today). A store release still starts with a
version bump PR; the build number is the only thing CI decides.

## The one step that needs the account owner

Xcode Cloud has to be enabled once for the app, and that authorises Apple to read the GitHub
repository. The App Store Connect API can create and edit workflows **after** that link exists,
but it cannot make the link (`scm providers` is read-only).

In Xcode, with the Datalyst project open:

1. Project navigator → the **App** target → **Cloud** tab → **Get Started**.
2. Sign in, then authorize the GitHub account that owns the repository and pick
   `cYoren/Datalyst-project`.
3. Accept the suggested workflow. It only has to exist; it gets replaced by the configuration
   below.

Enable **Xcode Cloud > Manage Workflows** for the same Apple ID if the App Store Connect app
record asks to be linked.

## What happens after that

Once the product exists, everything is API-driven — no more clicking:

```bash
asc xcode-cloud products                        # ciProduct for the app
asc xcode-cloud scm repositories list           # the linked repository
asc xcode-cloud macos-versions                  # pick macOS Golden Gate 27.x
asc xcode-cloud workflows --app com.datalyst.app
asc xcode-cloud workflows create --file <workflow.json>
asc xcode-cloud run --app com.datalyst.app --workflow "Datalyst iOS" --branch main --wait
asc xcode-cloud status --run-id <id> --wait
asc xcode-cloud doctor --run-id <id> --wait     # reads the failure logs
```

Intended workflow configuration:

- **Start conditions**: branch changes on `main`, and pull requests into `main`. No tag builds.
- **Environment**: macOS Golden Gate 27 (nearest to the local Xcode 27.1), Xcode 27, no
  simulator tests (the project has none); `npm ci` runs in `ci_post_clone`.
- **Actions**: Archive for iOS, then TestFlight internal distribution on `main` only.
  Never App Store submission from CI: review submission stays a deliberate step.
- **Signing**: automatic. The App ID already has App Groups (`group.com.datalyst.app`) and
  HealthKit enabled, and the widget extension `com.datalyst.app.TodayWidget` exists, so Xcode
  Cloud can manage the certificates.

## Verified

The two scripts were run the way CI will run them: a clean worktree of the repository, then
`ci_post_clone.sh` (953 packages, Apple Sign-In patched), then `ci_pre_xcodebuild.sh` with
`CI_BUILD_NUMBER=901`, then a Release build with `CODE_SIGNING_ALLOWED=NO`. It ended with
`BUILD SUCCEEDED`, and both `App.app` and `PlugIns/TodayWidget.appex` reported
`CFBundleVersion 901` and `CFBundleShortVersionString 1.1.0` — the pairing App Store Connect
checks on upload.

## More than one app

Xcode Cloud has three different scopes, and only one of them is per app:

| Piece | Scope | How it is set |
|---|---|---|
| Compute hours | **Team** — 25 h/month included with the Developer Program, shared by every app, then billed monthly in tiers | Automatic |
| SCM connection (GitHub) | **Team** — one authorization, reusable by every app | Created by the first "Get Started", before that nothing exists (`scmProviders` is empty) |
| Product + workflow | **App** — one product per App Store app record | "Get Started" per app; the API cannot create products, only workflows |

So "Cloud for everything" is: one GitHub authorization, then one click per app. Nothing is consumed while
an app has no builds — idle products cost nothing, only minutes do.

Spend policy, because 25 h shared is 1500 minutes and a Datalyst build is 3–4 minutes (`npm ci` + archive):

- Build on changes to `main`, and on pull requests **only when asked** (label or manual run). Never on every
  push of every branch.
- Apps that already build iOS with EAS (Expo) keep EAS; running both duplicates spend for the same IPA.
  Cloud is for the projects with a real `*.xcodeproj` (Datalyst, the games, Aleph).
- `asc web xcode-cloud usage days` reports the minutes per product, so this stays a number and not a guess.

`asc apps list` gives the app ids; the enable page is
`https://appstoreconnect.apple.com/apps/<app-id>/ci`.

## Cost and limits

25 compute hours per month on the Apple Developer Program, shared with everything else. One
build here is roughly `npm ci` (≈1 min) plus the archive (≈2 min), so it fits; PR builds are the
part to watch. `asc xcode-cloud build-runs` lists what was used.

## Local build, still supported

`scripts/native-build.sh` and `fastlane/Fastfile` are unchanged and stay the fallback for a
signed archive from a logged-in GUI session. CI does not replace them; it removes the need for
them on the critical path.
