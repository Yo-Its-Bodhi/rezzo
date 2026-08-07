# La Chingada Reservations

A branded reservation, table-control, and waitlist application for La Chingada.

## Run locally

```powershell
npm install
npm run dev
```

Open `http://localhost:3000`.

## App surfaces

- `/` — guest reservation flow with table-aware availability and policy consent
- `/manage` — booking lookup and cancellation with the 24-hour cutoff
- `/waitlist` — mobile-first QR waitlist entry
- `/waitlist/respond?id=...` — five-minute offer acceptance or decline
- `/admin` — live reservations, phone bookings, pause controls, table blocks, statuses, and waitlist offers

The interactive preview stores data in browser local storage, allowing the entire guest-to-staff workflow to be tested without infrastructure credentials. Staff table blocks and the online pause state immediately affect guest availability.

## Availability rules

- Maximum party size of 6
- Two-hour table occupancy
- Fifteen-minute start times following the weekly restaurant schedule
- Last reservation start one hour before closing
- No more than three reservation starts per clock hour
- Hidden table assignment using the smallest suitable available table
- Two independently tracked six-person tables
- Staff blocks and online pause controls
- Configurable happy-hour table-capacity rules in the availability engine
- Toronto time-zone evaluation

The pure availability engine is in `src/lib/availability.ts`, with its core operating rules covered by unit tests.

## Production persistence

`database/schema.sql` contains the PostgreSQL production model, including:

- exclusion constraints preventing overlapping assignments to one table
- service periods and happy-hour rules
- versioned policy acceptance
- reservation and waitlist lifecycles
- five-minute waitlist offers
- notification outbox
- staff roles and audit events

Before public launch, replace the browser-storage adapter with PostgreSQL-backed route handlers and protect `/admin` and notification endpoints with staff authentication.

## SMS and email delivery

Copy `.env.local.example` to `.env.local` and fill in:

- `APP_URL` — a URL the guest's phone can open; use the deployed HTTPS URL in production
- `TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN`, and `TWILIO_FROM_NUMBER`
- `RESEND_API_KEY` and `EMAIL_FROM`

The Resend sender must use a domain verified in Resend. Trial Twilio accounts can send only to verified recipient numbers. Restart `npm run dev` after changing environment variables. The waitlist screen now reports delivery errors and marks an entry as offered only when at least one channel succeeds.

## Validation

```powershell
npm test
npm run lint
npm run build
```
