# KinDose

**A little care. A little closer.**

KinDose is an elder-centered medication and care coordination prototype built for Catalyst 2026's "Elderly Care & Medication Management Platform" challenge.

The elder owns the circle. Family and care partners help with daily check-ins, but cannot change the elder's preferences, sharing choices or membership.

> Hackathon prototype. Use fictional information only. Not medical advice, an emergency service, or a clinically validated medication system. Always follow the prescriber's instructions.

## Try it

Open the deployed app and choose **Explore a sample circle**. Each session gets its own fictional circle. Switch between elder, family and care-partner views to see the permission boundaries. Sample circles cannot send email or invite real people.

For a full account flow, create a circle using a fictional name and a passphrase with at least 10 characters. Keep the circle ID. The elder can invite members with distinct passphrases and revoke their access.

## What works

- Separate elder, family and care-partner access, with salted passphrase hashes and signed HttpOnly sessions.
- Medication schedules, due/upcoming/missed states, taken/skipped/undo check-ins and remaining-dose stock.
- Recent adherence excluding future doses and dates before a medication was added.
- Appointment editing, preparation questions and completion status.
- Shared care notes, elder-owned preferences, consent controls and activity history.
- Deterministic upcoming/missed-dose and appointment email plans, with provider delivery records and deduplication.
- Structured care handoff. An optional, consent-gated Groq adapter can turn the same facts into a plain-English summary. Without a key, the app uses the structured summary.
- Private cloud persistence on Vercel Blob; local JSON storage for development.
- Responsive layout, keyboard focus, reduced-motion support and senior reading mode.

Email is deliberately restricted to deployment-approved test recipients. Never add an unconsenting recipient. Delivery requires the sender and scheduler setup described in [deployment](docs/DEPLOYMENT.md). Preview and failure records are not proof of delivery.

## Run locally

Node.js 22 or newer:

```sh
npm ci
npm test
npm run dev
```

Open `http://localhost:3000`. Without cloud environment variables, records stay in `.local-data/`, which is ignored by Git. Without an email key, no email is sent. A development-only session secret is used locally; production requires `SESSION_SECRET`.

```sh
npm run check
npm audit --omit=dev
```

## Project map

```text
public/              HTML, CSS and browser application
api/care.mjs         Auth, roles and care-circle API
api/cron.mjs         Protected reminder worker
lib/domain.mjs       Scheduling, adherence and validation
lib/store.mjs        Local/private-cloud persistence
lib/email.mjs        Email adapter and recipient safeguards
test/                Node unit and integration tests
docs/                Setup, security and demo notes
.github/workflows/   Tests and optional reminder scheduler
```

## Architecture

The browser calls only the same-origin API. The API verifies the signed session and active membership on every authenticated request. Mutations carry a version and use cloud ETag preconditions to prevent silent overwrites. The reminder worker uses a separate bearer secret and checks active membership, elder sharing consent, recipient allowlisting and deterministic message keys before calling the email provider.

No credentials are stored in browser code. The sample dataset is fictional and isolated per circle.

## Limits and next steps

This is a single-day prototype, not production healthcare software. There is no verified identity, email ownership verification, MFA, password recovery or clinical validation. Passphrases must be shared privately by the elder. In-memory rate limits are best-effort per server instance. The current adherence calculation follows the current medication schedule, so edits or archiving can change historical percentages. The reminder scheduler can run late and is not a real-time guarantee. Do not rely on it for treatment.

Before any real pilot: independent security and accessibility audits, verified invitations, durable abuse protection, encrypted field storage, retention controls, schedule history, full delivery-webhook processing, clinical review and relevant privacy/legal review are required. See [security](docs/SECURITY.md).

## Build disclosure

Built with AI assistance, including Arena for frontend generation and correction, followed by integration testing and review. The app does not use AI to prescribe medication or change doses. All sample people and health records are fictional.
