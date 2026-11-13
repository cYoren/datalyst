# Native surfaces

Everything that runs outside the WebView: the Capacitor shells, the home screen widgets, and
the navigation chrome we decided to use or skip. One page, so the next build does not
re-litigate it.

## Shell shape as built

- `capacitor.config.ts` loads the live site (`server.url = https://www.datalyst.one/dashboard`).
  `www/` is a placeholder, so a release is a shell release, not an asset bundle.
- `android/app/src/main/java/com/datalyst/app/MainActivity.java` is the single inset owner: it
  pads the content view for `systemBars|cutout|ime` and clears those insets for the WebView.
  `capacitor.config.ts` sets `SystemBars.insetsHandling: 'disable'` to match.
- Plugins in use: `DatalystWidget` (own), `@capgo/capacitor-health`,
  `@capacitor/local-notifications`, `@capacitor-community/apple-sign-in`,
  `@capacitor-community/in-app-review`, `@capacitor/browser`, `@capacitor/app`.

## UI libraries for the shells: evaluated, not adopted (2026-11-11)

| Option | Why not now |
|---|---|
| Capstart (`npx capstart init`) | Scaffold and CLI for adding Capacitor to a web app, plus a React + Vite boilerplate. The shell already exists with a widget plugin, a MainActivity inset owner, an Apple Sign-In postinstall fix and a reviewed build pipeline. Nothing to initialize. Its docs pages on native bars and transitions are the useful part. |
| Capacitor Native UI (rdlabo) | Re-implements HTML controls as UIKit/SwiftUI, Ionic-oriented, Android Compose extensions still experimental. Forks the UI away from the single web codebase that also serves the browser, the self-hosted build and the AGPL repo. |
| NativeScript for Capacitor | Embeds a second runtime and changes the build pipeline so native code is written in TypeScript. We have no custom native code beyond the widget, and a small plugin is cheaper than a runtime. |
| Capgo Native Navigation | The only real candidate: native tab bar, Liquid Glass, native transitions, MPL-2.0, peer `@capacitor/core >=8.0.0` (we are on 8.3.4), same vendor as `@capgo/capacitor-health`. Deferred, see the gate. |

### Gate for native navigation

Prototype only when all three hold:

1. The WebView has local assets (local-first / bundled `www/`), so a native bar is not painted
   over a remote page that goes white on cold start.
2. Either `MainActivity` stops owning insets and the plugin owns them through its
   `--cap-native-*` variables, or double padding is proven impossible.
3. A Mac build and both store reviews fit in the same window.

Prototype scope: mobile tab bar only (dashboard, create, data). Web navigation stays for the
browser and the self-hosted build, switched by `Capacitor.isNativePlatform()`. Pass criteria:
no double padding, hardware back works, deep links land, both stores approve.

## Home screen widgets

| | iOS | Android |
|---|---|---|
| Provider | `ios/App/TodayWidget` target inside `ios/App.xcodeproj` (embedded in the app) | `TodayWidget.java` + `res/xml/widget_today_info.xml` |
| Data | App Group `group.com.datalyst.app`, written by `DatalystWidgetPlugin.swift` | `datalyst_widget` SharedPreferences, written by `DatalystWidgetPlugin.java` |
| Web feed | `src/lib/widget.ts`: `syncWidget` on every `/api/dashboard/today` fetch, `clearWidget` on sign-out | same |
| Families / size | small, medium, accessory circular, accessory rectangular, accessory inline. The widget target is iOS 17 (App Intents); the app itself still installs on iOS 15/16, where the widget is simply absent | 2x2 and 4x2, resize-aware, picker preview from the layout |
| Day rollover | second timeline entry at midnight, no app run needed | `updatePeriodMillis` 1h plus a stale-date check |
| Signed out | "Open Datalyst to set up your check-in" | same string |
| Tap | logs the next yes/no check-in in place; elsewhere `datalyst://dashboard/checkin` | same |

### Widget design

One composition at every size: the fraction, the next check-in, the capacity bar closing the
base. Text is centred, the bar is pinned, and nothing else is added.

- **Palette is the app's** (`src/app/globals.css`): surface `#1a1b20`, ink `#f2f1ee`, muted
  `#aaa9a6`, accent `#9d9fff`. The old `#5D61D5` block was pre-redesign brand and is gone.
- **Colour carries state, not decoration**: the bar is accent while the day is open and turns
  `#5ed3b5` when it is logged. Text stays muted in every state.
- **The next check-in is the useful line.** `syncWidget` sends the first variable without an
  entry (experiment-controlled variables excluded), so the widget answers "what is left"
  without opening the app. Long names ellipsize instead of wrapping the layout.
- **No number without data.** Signed out or not yet synced, the fraction is hidden so a bare
  "0" never reads like a score.
- **Tap goes to the check-in** when it cannot log for you: `datalyst://dashboard/checkin`,
  handled by `src/components/native/NativeCheckinLink.tsx` (the scheme is registered on both
  platforms; `datalyst://auth` stays with `NativeAuthCallback`).

### One tap logging

The widget logs the check-in it is already showing, without opening the app, and only when it
can be honest about the value: yes/no variables. Anything else (scale, number, category) has to
open the app, where the value is chosen.

- **Credential**: `POST /api/widget/token` (session auth) issues one device key per install,
  stored hashed in `ApiKey` with scope `widget:log`, capped at five per account with the oldest
  retired. Rotation is not per-issue, otherwise a phone and a tablet would revoke each other.
  Issuance is limited to three per user per minute, so a shell that keeps failing cannot churn
  rows or retire another device's key. It never leaves the app sandbox (App Group on iOS,
  private SharedPreferences on Android) and never appears in the web bundle. It shows up in
  Settings like any other key, so it can be revoked. It is deleted on sign-out, and also by any
  sync that finds no session, which covers a session that ended without the sign-out button
  (expired refresh token, another tab).
- **Write**: `POST /api/widget/log` takes the bearer key, checks the subvariable belongs to the
  key owner **and is yes/no**, writes `numericValue = 1` for the widget's local day, and answers
  with the fresh day so the widget re-renders without a second request. Four bounds keep a
  leaked key from being more than one tap:
  - **The day** must be the user's own day (`isWidgetDayAllowed`, from `user.timezone`), or the
    server's UTC day, which is accepted so a missing or stale timezone cannot lock someone out
    of a check-in they can see. Yesterday and tomorrow in the user's own timezone are refused.
  - **The schedule** must offer it: ad-hoc trackers and weekly trackers whose day is not today
    are refused, the same rule `getTodayLog` applies, so the API cannot write an entry the
    product then hides.
  - **The experiment**: the active experiment's independent variable is refused, with the same
    date bounds `EntryService.quickEntry` uses, so an experiment that has ended does not block.
  - **The rate**: the key's own `rateLimitPerMinute` is charged per key id. The counter is an
    in-process map, so it is per server instance and resets on a cold start; it bounds one
    instance's traffic, not the fleet's. The daily per-user AI budget is the durable ceiling for
    AI work; there is no durable equivalent for widget writes yet.
- **Failure**: a 401 clears the key and the next app sync issues a new one; any other failure
  shows "Couldn't log, tap to open" until the next sync replaces it. The notice is written by
  the shell, cleared by `DatalystWidgetPlugin.update` on both platforms, and hides the Log
  button meanwhile, so it cannot latch: the next sync always clears it. Nothing is queued
  offline.
- **Hand-off**: the web asks the shell `hasToken()` and only mints a key when the answer is no,
  so steady state is zero extra requests. A shell built before `hasToken` existed throws on that
  call, and the failure is caught separately: it cannot store a key either, so nothing is
  minted and the update still runs. Without that, every already-installed build would stop
  syncing and stop clearing the widget on sign-out.
- **Platforms**: Android taps a `PendingIntent` broadcast handled by `WidgetLogReceiver`
  (`goAsync`, background thread, then re-render); iOS uses an interactive widget button with
  `LogNextCheckInIntent` (App Intents, iOS 17).

History: build 1.0.5 (iOS 36, AAB 35) introduced widgets and reminders. iOS has had them since;
Play stayed on an older build because of the upload-key mismatch, so Android users get the
widget with the next Play upload.

## Next build checklist

Device checks for one tap: the Log pill appears only when the next check-in is yes/no, a tap
writes the entry (verify on `/dashboard`), the button disappears once nothing loggable is left,
revoking "Home screen widget" in Settings makes the next tap fall back to "Couldn't log" and a
later sync reissues a key.

1. Version must move together: `native-version.json`, `android/app/build.gradle`, and every
   `CURRENT_PROJECT_VERSION` / `MARKETING_VERSION` in `ios/App.xcodeproj` (App **and**
   TodayWidget). A widget whose `CFBundleVersion` differs from the app fails upload.
2. Mac: regenerate the TodayWidget provisioning profile with App Group
   `group.com.datalyst.app` for `com.datalyst.app.TodayWidget`, then a signed archive.
3. Device: the widget appears in the picker with its preview, the fraction matches
   `/dashboard`, the next name matches the first unlogged check-in, midnight resets it without
   opening the app, sign-out hides the fraction, a tap lands on the check-in.
4. Android release: restore the keystore and signing properties from the Mac before signing.
5. Store copy mentions the widget only once a binary that has it is live.

## Next iteration

- One-tap logging covers yes/no only. A scale or number variable still opens the app, because
  the widget has no way to pick the value honestly; a rotary or stepper in the widget would be
  the next step, not a default.
- A streak or last-7-days widget once `Levels` exposes a stable per-day summary.
- A bundled UI face: the app draws Inter/Archivo on the web, the widgets use the system face.
