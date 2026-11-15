# Deployment and optional services

## Vercel

Import the project as a Node.js/Other project with static output `public/` and serverless functions under `api/`. Use a private Vercel Blob store connected to the project. Keep the deployment on the free Hobby tier. Do not enable paid upgrades.

Set server-side environment variables:

| Variable | Purpose |
| --- | --- |
| `SESSION_SECRET` | Long random secret for signed sessions. Required in production. |
| `BLOB_READ_WRITE_TOKEN` | Private Blob store token, or a connected store's supported configuration. |
| `CRON_SECRET` | Separate long random secret protecting `/api/cron`. |
| `RESEND_API_KEY` | Optional transactional email key. |
| `REMINDER_FROM` | Optional provider-approved sender. |
| `REMINDER_TO_ALLOWLIST` | Comma-separated explicitly approved test addresses. Empty disables recipient enrollment/sending. |
| `GROQ_API_KEY` | Optional summary provider key; never put it in the browser. |

Do not commit `.env` files, tokens, `.vercel/`, local circle data or private logs.

## Proactive email

The app plans upcoming-dose reminders in the next 30 minutes, missed-dose follow-ups after a 30-minute grace period, and appointment reminders within 24 hours. A completed appointment does not generate a reminder. The elder can opt family/care partners into alerts; default is off.

Only active members with an allowlisted email are eligible. Sample circles are never emailed. With no provider configuration, queue entries are previews, not sends. With a provider configured, the application records the provider's acceptance as sent. It does not claim inbox delivery or read status.

Use a free sender account only after accepting its terms yourself and obtaining recipient permission. Some providers' sandbox senders deliver only to the account owner's verified address. Production use needs a verified sender domain and verified recipient enrollment, neither of which this prototype implements.

## Scheduler

The optional `reminders.yml` workflow calls the protected endpoint every 15 minutes, at minute offsets 7/22/37/52, plus manual dispatch. It is disabled unless repository variable `REMINDERS_ENABLED=true` is set. It also refuses non-public repositories to avoid private-runner usage costs. Set repository secret `KIN_CRON_SECRET` and repository variable `KIN_APP_URL` to the verified deployment origin before enabling it.

GitHub schedules can be delayed or skipped, and inactivity can disable them. This is a demonstration, not guaranteed medication monitoring. No paid cron service is needed. The endpoint requires the secret and skips fictional sample circles.

The prototype lists up to 100 circles per reminder run. A real deployment needs pagination, retention/cleanup, monitoring, delivery webhooks and safe retry/locking around concurrent workers.
