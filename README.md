# Warehowz Cron Service

Standalone runner for Warehowz's scheduled background jobs. These used to run
in-process inside the main web app (via `lib/cronGuard.js`) — a failing or
heavy job could crash or slow down the whole server. This service runs them
in a separate process against the same MongoDB database, so job load/failures
no longer affect the web app.

This folder is meant to be moved into its own git repository. It runs as six
**Cloud Run Jobs** — run-to-completion containers, not an always-on service —
one per cron job below, all built from the same image. Which job a given
execution runs is picked entirely by the `JOB_SLUG` env var set on that Cloud
Run Job resource (see `index.js`). **Timing lives entirely in Cloud
Scheduler**, which triggers each Job's execution via the Cloud Run Admin API
on its own schedule — there is no HTTP server and no in-process scheduler.

## Jobs

| Job | Cloud Run Job name | `JOB_SLUG` | Cloud Scheduler cron (UTC) | Source file |
|---|---|---|---|---|
| `QueueTimeTracker` | `warehowz-cron-queue-time-tracker` | `queue-time-tracker` | `0 * * * *` (hourly, was every minute) | `jobs/queueTimeTracker.js` |
| `BuyerAccountCheck` | `warehowz-cron-buyer-account-check` | `buyer-account-check` | `1 */4 * * *` (00:01, 04:01, 08:01, 12:01, 16:01, 20:01) | `jobs/buyerAccountCheck.js` |
| `PendingStatusCheck` | `warehowz-cron-pending-status-check` | `pending-status-check` | daily 04:01 | `jobs/pendingStatusCheck.js` |
| `PaymentScheduler` | `warehowz-cron-payment-scheduler` | `payment-scheduler` | daily 05:01 | `jobs/paymentScheduler.js` |
| `ProjectRenewal` | `warehowz-cron-project-renewal` | `project-renewal` | daily 06:00 | `jobs/projectRenewal.js` |
| `ProjectExpiry` | `warehowz-cron-project-expiry` | `project-expiry` | daily 06:00 | `jobs/projectExpiry.js` |

All jobs share one on/off switch: the `Settings.enableCronJobService` flag in
MongoDB (the same flag the main app's admin panel toggles). `jobs/index.js`
checks it on every execution — if it's off, the run exits 0 having done
nothing (logged as skipped), not treated as a failure.

Each execution runs exactly one job, then the container exits — 0 on
success, 1 on any thrown error (including an unknown/missing `JOB_SLUG`),
so Cloud Run Job's own failure count/retry/alerting reflects real job
failures.

## Deploying: Cloud Run Jobs + Cloud Scheduler

`.github/workflows/deploy.yml` builds the image once and runs
`gcloud run jobs deploy` for all six Jobs on every push to `main` — that part
is automatic. Two things are **one-time manual setup** per environment,
because they don't change on every deploy:

1. **Grant Secret Manager access** to the Cloud Run Job's runtime service
   account (see [Secrets](#secrets) below) — same requirement as before.

2. **Create the six Cloud Scheduler jobs**, one per row in the table above.
   Cloud Scheduler triggers a Cloud Run Job execution by calling the Cloud
   Run Admin API directly (`...:run`), authenticated with an OAuth token —
   this is a different auth mechanism than calling a Cloud Run *service*
   (which uses OIDC), because there's no HTTP endpoint of ours in the loop
   at all.

   ```bash
   # One-time: dedicated service account for Cloud Scheduler to act as.
   gcloud iam service-accounts create cron-scheduler \
     --display-name="Cloud Scheduler trigger for warehowz-cron Jobs"

   # Per Cloud Run Job: grant that service account permission to start it.
   gcloud run jobs add-iam-policy-binding warehowz-cron-queue-time-tracker \
     --region=<region> \
     --member="serviceAccount:cron-scheduler@<project>.iam.gserviceaccount.com" \
     --role="roles/run.invoker"

   # Per Cloud Run Job: the Cloud Scheduler job that fires its execution.
   gcloud scheduler jobs create http queue-time-tracker \
     --schedule="0 * * * *" \
     --uri="https://<region>-run.googleapis.com/apis/run.googleapis.com/v1/namespaces/<project>/jobs/warehowz-cron-queue-time-tracker:run" \
     --http-method=POST \
     --oauth-service-account-email=cron-scheduler@<project>.iam.gserviceaccount.com \
     --oauth-token-scope="https://www.googleapis.com/auth/cloud-platform" \
     --location=<region>
   ```

   Repeat the `add-iam-policy-binding` + `scheduler jobs create` pair for the
   other five Jobs, swapping the Job name and `--schedule` per the table.

Because Cloud Run Jobs has no built-in mutex across executions, firing the
same Job manually while its schedule is also about to fire will run it
twice concurrently. The `isRunning` guard inside `jobs/queueTimeTracker.js`
only protects against overlapping ticks within a single long-lived process —
it does nothing across two separate Job executions. Avoid double-triggering,
especially for `PaymentScheduler`.

## Secrets

This service is **production-only** — there is no staging deployment of it.
It reads secrets the same way the main app does — **no `.env` file** — via
GCP Secret Manager (`config/secret-manager.js`), but from a dedicated
production secret rather than the main app's shared one: project
`warehowz-prod`, secret `ENV_PRODUCTION` (the main app instead reads project
`warehowz-dev`, secret `ENV_STAGING`, and picks its shape from a `NODE_ENV`
field inside that payload — this service skips that step and always builds
the production config shape).

The Cloud Run Job's runtime service account needs the
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
├── index.js            Cloud Run Job entry point: reads JOB_SLUG, loads secrets, connects Mongo, runs that one job, exits
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
    ├── index.js          Builds the slug -> job Map and wraps each with the Settings guard
    └── *.js              One file per job, ported from the main app's controllers
```

## Running locally

```bash
npm install
JOB_SLUG=queue-time-tracker npm start
```

Swap `JOB_SLUG` for any slug in the table above to run a different job. The
process connects to Mongo, runs that one job to completion, and exits — same
as it will inside a Cloud Run Job execution.

Requires network access to GCP Secret Manager (via ADC or a service account)
and to the same MongoDB instance the main app uses.

## When porting further changes from the main app

If the main app's job logic changes (e.g. `app/controllers/provider/invoice.js`'s
`PaymentScheduler`/`PendingStatusCheck`, or `app/controllers/manager/projectQueueTimeTracker.js`),
those changes need to be manually re-applied here too — this is a one-time
extraction, not a shared package, so the two copies will drift unless kept in
sync by hand.
