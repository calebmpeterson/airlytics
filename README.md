# Airlytics

Cookieless, clientless web analytics powered by Netlify Functions and Airtable.

## Runtime and development

Use Node 24 (`.tool-versions`, `engines.node`, and Netlify build environment) and Yarn Classic 1.22.22. The official Airtable SDK is pinned at 0.12.2. Set `AIRTABLE_API_KEY` to an Airtable personal access token with access to the relevant base and table; never commit credentials. For reporting it needs read access as well as the existing ingestion write access.

```sh
yarn install --frozen-lockfile
npm test
npm run build
npm run build:bundle
```

The build produces `build/event/event.js` and `build/funnel-report/funnel-report.js`, which Netlify bundles as `/.netlify/functions/event` and `/.netlify/functions/funnel-report`. Webpack 5 replaces Webpack 4's incompatible OpenSSL hashing; no legacy crypto flag is required. The existing cleanup script still uses the `All Events` view and its six-month retention filter. It deletes records and must only be run deliberately with suitable credentials: `node scripts/delete-old-records.js <base-id>`.

## Capture

Legacy cross-origin GET remains unauthenticated:

```text
GET /.netlify/functions/event?pid=appEXAMPLE&sid=visitor&pathname=/path&action=page:load
```

`sid` defaults to an empty string, `action` to `page:view`, and `pathname` to the Referer URL's pathname when available. A successful GET returns `200 {"success":true}`. OPTIONS continues to support cross-origin requests. The `Visits` record is created with exactly `Client ID`, `Pathname`, `Action`, `Date / Time`, `Country`, and `Client IP`. Existing IP collection is unchanged.

JSON POST is additive:

```json
{"pid":"appEXAMPLE","sid":"visitor","pathname":"/squarespace-tools/bulk-editor","action":"experiment:bulk-editor:purchase_intent_click:v1","properties":{"opportunity":"bulk-editor","offerVersion":"v1","priceCents":12900,"currency":"USD","source":"google","medium":"organic","pageType":"landing"}}
```

POST requires nonempty string `pid`, `pathname`, and `action`; `sid` defaults to empty. Its body is limited to 8 KiB. Optional properties must be a flat object with at most 20 keys, keys at most 64 characters, and serialized size at most 2 KiB. Allowed keys are `opportunity`, `offerVersion`, `priceCents`, `currency`, `source`, `medium`, and `pageType`; values are scalar JSON (finite numbers, booleans, null, or strings of up to 64 ASCII letters, digits, underscores, or hyphens). Do not send names, emails, phone numbers, checkout data, or site URLs. These restrictions reduce accidental PII collection but clients must still avoid placing personal data in categorical values.

For property storage only, an administrator may manually add a Long text field named `Properties` to `Visits`. No schema change is needed for ingestion or basic reporting. The handler first creates the six-field record, then updates only that same record's `Properties` with JSON. POST returns `{"success":true,"enrichment":"saved|not_requested|skipped|failed"}`. Invalid optional properties, a missing field, permission/API errors, a missing record ID, or a two-second update timeout produce a redacted warning and a 200 after successful core creation. A timed-out update may still complete later; its result is unknown. Invalid JSON or mandatory POST fields return 400 without a write; a core write failure returns 500 and is not retried by the handler. Never retry an ambiguous create automatically. No reporting operation is on the capture path.

## Funnel report

Set a strong `AIRLYTICS_REPORT_TOKEN` as a Netlify secret scoped to Functions. Optionally set `AIRLYTICS_REPORT_BASE_IDS` to a comma-separated list of allowed base IDs. Keep the token on a trusted server, never in browser code. Missing or invalid tokens fail closed before an Airtable read. This token authorizes report access to any base accessible to the Airtable credential unless the allowlist is configured.

Run the interactive report client from an installed checkout:

```sh
npm run funnel-report
```

It prompts for the report token (without echoing it), Airtable base ID, opportunity slug, and inclusive UTC dates. The default interval is the last 30 UTC calendar days including today. It sends the token only to `https://analytics.cubicle6.com` over HTTPS using HTTP/1.1 and prints the JSON report. Run it in an interactive terminal; it does not save the token. To query a different deployment, use its authenticated API directly.


Dates are inclusive UTC calendar days, at most 31 days; opportunity is a lowercase hyphenated slug. The report queries `Visits` without an Airtable view or a required `Properties` field, using SDK pagination and a 5,000-record limit plus one sentinel. `truncated` and `partial` signal incomplete results. Landing counts use `page:load` at `/squarespace-tools/<opportunity>`; stages use `experiment:<opportunity>:<stage>:<offer-version>` for `preview_interaction`, `pricing_viewed`, `purchase_intent_click`, `email_submitted`, and `email_confirmed`. Emit `email_confirmed` only after the provider confirms ownership. Existing action names are unchanged.

Each stage reports total events, distinct identified visitors, and events missing identifiers. An identified visitor count is null if stage events exist but none have identifiers; missing identifiers make the report partial. Conversion rates are event counts divided by landing event counts, not unique-person conversion probabilities, and are null when there are no landing events. Optional property coverage and categorical breakdowns describe relevant events; absent or malformed properties do not block core counts. The cleanup policy limits historical reporting.

## Deployment verification and rollback

Do not deploy until reviewed. In Netlify, inspect site/team/context `NODE_VERSION` overrides and build logs; this repository sets `NODE_VERSION=24` for builds. Functions normally follow the build Node version. Check any `AWS_LAMBDA_JS_RUNTIME` override in the Netlify UI/API and remove an older override or set it to `nodejs24.x` if necessary; runtime-only variables must be set in the UI/API, not TOML. Verify the actual deployed Function runtime in a safe preview using Netlify's Function configuration/logs or a temporary private diagnostic, then remove the diagnostic. Node 26 is not selected because deployed Functions support has not been verified for this site.

After review, deploy a preview with nonproduction credentials and test GET, POST, preflight, and authenticated reports against two safe test bases, one with and one without `Properties`. Check logs for redacted degradation warnings, runtime version, and both function routes. Configure `AIRTABLE_API_KEY` and the report token with Functions scope; do not expose either to the client. No live Airtable changes are performed by this repository upgrade.

Roll back by restoring the prior Netlify deploy (including its prior runtime/environment configuration), or revert the migration commit and rebuild with its previous lockfile and Node 16 configuration. No Airtable schema rollback is necessary; an optional `Properties` field can remain in place. The prior runtime is unsupported and should be a temporary emergency rollback only.
