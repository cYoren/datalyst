# Where Datalyst is sold, and what is still "soon"

| Store | Status | URL |
|---|---|---|
| Google Play (Android) | live | https://play.google.com/store/apps/details?id=com.datalyst.app |
| App Store (iPhone, iPad) | live | https://apps.apple.com/app/id6773505371 |
| Chrome Web Store | live | publisher `72f6d51e-d147-4830-995a-fbb48aae0bf3` (MedHub), item `lofhjmlgmhgcoblblodhlabjapjnccjp` |
| Firefox Add-ons | live | slug `datalyst-quick-log`, id `quicklog@datalyst.one` |
| Safari (inside the iOS app) | built 2026-11-11, needs the Mac | `clients/dist/safari` from `node clients/build-extension.mjs` |
| Microsoft Store | not submitted | — |

## The rule when a store goes live

Change these in one commit:

1. `clients/store-chrome/listing.md`, the `ALSO AN APP` line.
2. The popup's footer link, if the store it points at changes.
3. This table.

## Why it matters

The extension logs in seconds; the app is where the charts and correlations live. The listing is
the only place a reader learns the app exists, so it names both stores directly instead of
sending people to a hub page.
