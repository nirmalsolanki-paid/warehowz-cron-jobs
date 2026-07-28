# Warehowz Cron Service

Standalone runner for Warehowz's scheduled background jobs. These used to run
in-process inside the main web app (via `lib/cronGuard.js`) — a failing or
heavy job could crash or slow down the whole server. This service runs them
in a separate process against the same MongoDB database, so job load/failures
no longer affect the web app.

This folder is meant to be moved into its own git repository and deployed as
its own long-running service (it is **not** a one-shot script — it holds the
process open and fires jobs on a schedule via `node-schedule`, so it needs an
always-on host: e.g. a Cloud Run service with `min instances >= 1`, a GKE/
Compute Engine VM, etc. A Cloud Run *Job* / Cloud Scheduler HTTP-trigger model
does **not** fit this as-is).

## Jobs

| Job | Schedule (UTC) | Source file |
|---|---|---|
| `QueueTimeTracker` | every minute | `jobs/queueTimeTracker.js` |
| `BuyerAccountCheck` | `1 */4 * * *` (00:01, 04:01, 08:01, 12:01, 16:01, 20:01) | `jobs/buyerAccountCheck.js` |
| `PendingStatusCheck` | daily 04:01 | `jobs/pendingStatusCheck.js` |
| `PaymentScheduler` | daily 05:01 | `jobs/paymentScheduler.js` |
| `ProjectRenewal` | daily 06:00 | `jobs/projectRenewal.js` |
| `ProjectExpiry` | daily 06:00 | `jobs/projectExpiry.js` |

All jobs share one on/off switch: the `Settings.enableCronJobService` flag in
MongoDB (the same flag the main app's admin panel toggles). `jobs/index.js`
checks it before every single run — if it's off, the job is skipped and
logged, not removed from the schedule. Turning it off here has the exact same
effect as turning it off in the main app always had.

## Secrets

This service is **production-only** — there is no staging deployment of it.
It reads secrets the same way the main app does — **no `.env` file** — via
GCP Secret Manager (`config/secret-manager.js`), but from a dedicated
production secret rather than the main app's shared one: project
`warehowz-prod`, secret `ENV_PRODUCTION` (the main app instead reads project
`warehowz-dev`, secret `ENV_STAGING`, and picks its shape from a `NODE_ENV`
field inside that payload — this service skips that step and always builds
the production config shape).

Whatever host runs this service needs a service account with the
**Secret Manager Secret Accessor** role on the `ENV_PRODUCTION` secret in
`warehowz-prod`. Locally, run `gcloud auth application-default login` first
(with access to that project).

Only these keys from the `ENV_PRODUCTION` secret payload are used here:

- `MONGODB_CONNECTION_STRING` — same production database as the main app
- `APP_URL`
- `STRIPE_SECRET_KEY`
- `SEND_GRID_API_KEY`, `SENDER_EMAIL`
- `IMPERSONATION_KEY` — **must** match the main app's production value. It
  signs the continuity-auth links embedded in emails (e.g. invoice links);
  if it doesn't match, the main app will reject those links as invalid.

## Structure

```
cron-service/
├── index.js            Entry point: loads secrets, connects Mongo, starts jobs
├── config/
│   ├── index.js         Mutable config object + init(secrets), mirrors config/config.js
│   ├── secret-manager.js GCP Secret Manager loader (copied from main app)
│   └── emails.js         Per-env notification recipient lists (copied from main app)
├── models/               Mongoose schemas this service's jobs touch (copied from app/models)
├── lib/
│   ├── notification.js    sendTemplateEmail/sendUserMailManager/sendErrorEmail (copied)
│   ├── stripeCardSync.js  refreshCardFromStripe/abandonOldPaymentMethod (copied)
│   ├── timeConverter.js   (copied)
│   └── continuity_auth.js buildContinuityAuthQuery/verifyContinuityAuth (copied)
├── emails/               Full email template set (copied from /emails)
└── jobs/
    ├── index.js          Registers every job with node-schedule + the Settings guard
    └── *.js              One file per job, ported from the main app's controllers
```

## Running

```bash
npm install
npm start
```

Requires network access to GCP Secret Manager (via ADC or a service account)
and to the same MongoDB instance the main app uses.

## When porting further changes from the main app

If the main app's job logic changes (e.g. `app/controllers/provider/invoice.js`'s
`PaymentScheduler`/`PendingStatusCheck`, or `app/controllers/manager/projectQueueTimeTracker.js`),
those changes need to be manually re-applied here too — this is a one-time
extraction, not a shared package, so the two copies will drift unless kept in
sync by hand.
