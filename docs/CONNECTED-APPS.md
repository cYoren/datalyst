# Connected apps

Status: **built, with the gaps named below** (`ROADMAP.md` S1). What ships for keys
and agents beside this is in `INTEGRATIONS.md`.

Built: the registry, the connect screen with PKCE, one-time codes, `POST
/api/connect/token`, app-scoped keys with a readable list, `/api/v1/app/*`,
persisted rate limits, `ApiKeyEvent`, Settings → Connected apps, the "Measured
by" label, the Lab's measured-outcome card, per-variable provenance so an app
cannot overwrite a value the person edited.

Not built yet, and not claimed anywhere below: changing a connected app's
readable list without reconnecting; a paged view of every `ApiKeyEvent`; choosing
"keep or delete what it wrote" as one action at disconnect. Each is a real gap
in S1, listed here so nobody reads the rest of this file as a completion
receipt.

This is the contract between Datalyst and an app that wants to read a
person's context or write a measurement into their record. The first app is
Advanced Dual N-Back, and its side of the contract is in that repository's
`docs/ROADMAP.md` ("Connect Datalyst"). If the two documents disagree, this
one is right, because Datalyst holds the data.

## Why it exists

An assistant with an API key acts as the person, across the whole account.
That is right for a person's own assistant and wrong for an app: an app should
see only what it needs, write only what it owns, be connected without anyone
copying a key, and be removable in one tap.

## What a connected app may do

| | Allowed | Not allowed |
| --- | --- | --- |
| Read | The values of the variables the person picked for it, by day | Any other tracker, notes, experiments, patterns, export |
| Write | Daily values for trackers the app itself created | Any tracker the person or another app created; deleting anything |
| Create | Its own trackers, named and described by the registry entry | Experiments, studies, keys |
| Identity | Nothing: no name, no email | |

An app never receives the account-wide `read` or `write` scope.

## The registry

Apps are declared in code, in `src/lib/connected-apps.ts`. There is no
self-service registration in this version.

```ts
{
  id: 'advanced-dual-n-back',
  name: 'Advanced Dual N-Back',
  description: 'Measures working memory. Reads the context you choose, writes your daily result.',
  redirectUris: ['dualnback://datalyst/callback'],
  creates: [{
    key: 'working-memory',
    name: 'Working memory (Advanced Dual N-Back)',
    variables: [
      { key: 'dprime', name: 'Sensitivity', unit: "d′", type: 'NUMERIC', measured: true },
      { key: 'level',  name: 'Level',       unit: 'N',  type: 'NUMERIC', measured: true },
      { key: 'span',   name: 'Span',        unit: 'items', type: 'NUMERIC', measured: true },
    ],
  }],
  mayRead: 'chosen-variables',
  storeLinks: { ios: '…', android: '…' },
}
```

`measured: true` marks a value that came from an instrument rather than a
self-rating. The UI labels it, and the Lab can prefer it as an outcome.

## Connecting

Authorization code with PKCE, so the key never appears in a URL.

1. The app opens
   `https://www.datalyst.one/connect?app=<id>&redirect_uri=<uri>&code_challenge=<S256>&state=<random>`
   in the system browser.
2. Datalyst signs the person in (or creates the account), then shows one
   screen: the app's name and description, **what it will write** (the
   trackers from the registry), and **what it may read**, as a list of the
   person's own variables with nothing ticked. The person ticks what the app
   may see (it can be nothing) and approves.
3. Datalyst redirects to `redirect_uri?code=<one-time>&state=<state>`. The
   code lives 60 seconds and works once.
4. The app posts `{ code, code_verifier }` to `POST /api/connect/token` and
   receives `{ key, appTrackers, readable }`. It stores the key in the
   platform keystore.

Refused, each with a test: an unknown app id, a redirect URI not in the
registry, a reused or expired code, a wrong verifier, a missing `state`.

The person can disconnect an app in Settings → Connected apps: that revokes
the key at once, and what the app wrote stays in the record (they can delete a
day in Data). Changing what a connected app may read means disconnecting and
reconnecting — the connect screen is the grant, and there is no partial edit
screen yet. That is a gap, not a decision: the screen that changes one app's
ticked list without issuing a new key is still to be built.

## The key

An `ApiKey` row with three new facts:

| Field | Meaning |
| --- | --- |
| `appId` | The registry id. A key with an `appId` is an app key and gets none of the account-wide behaviour. |
| `readableSubvariableIds` | The person's own variables the person ticked. Empty means it can read none of them — it can still read the trackers it created (see the values row below). |
| `scopes` | `app:read`, `app:write`. Never `read`, `write` or the research scopes. |

Trackers an app creates carry `createdByAppId`. A write is accepted only when
the target tracker's `createdByAppId` equals the key's `appId`. This rule is
enforced in the service, not in the route, so the MCP path cannot bypass it.

The same mechanism closes two gaps already listed in `INTEGRATIONS.md`:
keys narrower than the account, and (below) a record of what a key did.

## The API

REST, JSON, under `/api/v1/app`. A thin layer over the services the app and
the MCP server already use. Dates are the person's local calendar date,
`YYYY-MM-DD`, always sent by the client; the server clock never picks a day.

| Call | Does |
| --- | --- |
| `GET /api/v1/app/me` | The app's trackers and variables with their ids, and the variables it may read (id, name, unit, type). No profile fields. |
| `GET /api/v1/app/values?from=&to=` | Daily values in the range (at most 92 days) for the variables the person ticked **and the variables of the trackers this app created** — an app has to be able to read back what it wrote and see that a day was edited by hand. Each value carries `date`, `variableId`, `value`, and `source` (`manual`, `apple_health`, `health_connect`, or `app:<id>`). A missing day is absent, not zero. |
| `PUT /api/v1/app/values` | Body: up to 50 `{ date, variableKey, value }`. Upserts one value per variable per day for the app's own trackers. Idempotent: the same body twice changes nothing. A day the person edited by hand is refused per variable: **409** when every item was refused, **200** with `written` and `refused` when only some were, so one manual fix cannot stop a whole sync. |
| `DELETE /api/v1/app/values` | Body: `{ date, variableKey }`. Removes a value the app wrote. It cannot remove a value the person edited. |

Rules:

- **One value per variable per day**, like every check-in. An app with several
  sessions a day sends the day's summary and may send it again as the day
  goes on.
- Entries are stored with `source = "app:<id>"`. If the person edits the
  value by hand the source is cleared, and the app's next write for that day
  is refused with `409` and the reason, exactly as a health import never
  overwrites a manual edit.
- Writes for dates more than 30 days back or in the future are refused.
- Values are validated against the variable's type and range.
- Errors are JSON with a stable `code` and a sentence a person could read.

## Limits and records

- Rate limit per key, counted durably (a database row or the edge), not in
  process memory. Default 60 requests a minute.
- Every write by an app key appends a row to `ApiKeyEvent`: key, app, action,
  tracker, date, time. No values. The person reads the **last five** per key in
  Settings (connected apps list their recent activity, assistant keys do too).
  The rows are kept for the retention window in `docs/PRIVACY_OPERATIONS.md`
  after the `ApiKeyEvent` fires — the page showing *all* of them, paged, is not
  built. This is the audit trail `INTEGRATIONS.md` says is missing.
- Nothing an app sends is logged outside that table. No values in server
  logs, error reports or analytics.

## In the product

- **Settings → Connected apps**: each app with what it writes, what it may
  read, when it last synced, its recent activity, and Disconnect.
- **Data**: an app's tracker looks like any other, with "Measured by
  Advanced Dual N-Back" under its name.
- **Lab**: a connected, measured variable can be the outcome of an
  experiment. With Advanced Dual N-Back connected, the template "Caffeine →
  Working memory (measured)" appears. Without it, the caffeine and focus
  templates carry one line, "Measure it instead of rating it", that opens the
  app's store page. This is the only place Datalyst advertises another app,
  besides Settings → Connected apps.
- **Patterns**: measured variables take part in correlations like any
  numeric variable.

## Self-hosted

The connect screen and the app API ship in the self-hosted build and work
against the person's own server. An app defaults to Datalyst Cloud; pointing
it at another server is that app's advanced setting.

## Who pays

A first-party connection is free on both sides and does not count against any
plan limit.

## Not in this version

Third-party registration, webhooks or push from Datalyst to an app, an app
reading patterns or experiment results, an app creating an experiment,
sharing between two people. Each needs its own decision and none is implied
by this contract.

## Done means

1. An integration test walks connect → token → `me` → write → read back →
   manual edit → refused overwrite → disconnect → `401`.
2. A key with an `appId` is refused by every account-wide tool and route, in
   a test that enumerates them.
3. The OpenAPI document covers `/api/v1/app/*` and `INTEGRATIONS.md` gains a
   "Connected apps" section generated or checked the same way its tool table
   is.
4. Advanced Dual N-Back, on a device, connects without a key being typed,
   fills an experiment's context from Datalyst, and its d′ appears in Data
   the next day.
