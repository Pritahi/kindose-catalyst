# Security and data boundaries

Use only fictional data in the hosted hackathon prototype.

## Implemented safeguards

- Random 24-character circle/member identifiers.
- A unique salt and scrypt hash per passphrase. Raw passphrases are never returned by the API.
- HMAC-signed, expiring sessions in HttpOnly, SameSite=Strict cookies; Secure in production.
- Active membership checked on every request. Revocation invalidates the member's next request.
- Elder-only access and consent changes; all roles can help with ordinary care records.
- Same-origin mutation checks, no-store API responses, a restrictive script policy and standard browser security headers.
- Input length limits and escaped UI rendering.
- Private Vercel Blob storage, with optimistic ETag checks for cloud writes.
- Email allowlist, no sample-circle sends, family-alert opt-in and provider idempotency keys.
- Optional AI disclosure and opt-in, with structured fallback. No diagnosis or medication advice.

## Deliberate limits

Private storage controls access but is not an end-to-end encryption claim. The app operator and hosting providers can process stored records. The email provider processes reminder content. If configured and opted into, the AI provider processes the limited handoff facts/preferences/notes sent by the server.

The app has not undergone an external security assessment. No identity verification, verified email enrollment, MFA, password reset, distributed rate limiter, intrusion detection, consent receipt system or healthcare compliance certification is claimed. A shared passphrase confers that member's access. Do not share credentials in screenshots or public posts.

Adherence is a coordination indicator, not a clinical metric. Current schedule edits affect historical calculations. Care logs are self-reported. A missing check-in does not prove a medication was missed. A provider-accepted email is not proof a person received or read it.

Circle deletion removes the application record from its active storage. Hosting logs, provider records, caching and provider retention may remain outside the application's direct control.

Report a suspected issue privately to the repository owner. Do not publish patient data or secrets in an issue.
