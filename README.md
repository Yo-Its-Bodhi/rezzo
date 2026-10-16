# La Chingada Reservations

A branded reservation and live floor-control application for La Chingada.

## Run locally

```powershell
npm install
npm run db:migrate
npm run dev
```

Open `http://localhost:3000`.

## Customer design preview

The customer reservation and booking-management pages now share La Chingada's restaurant identity: corn mark, locally hosted Barlow Condensed and DM Sans, marigold/chile/teal colours and genuine restaurant photography. See [the design handoff](docs/DESIGN_HANDOFF.md) for validation and remaining limits.

For a **local demo without a database connection or real bookings**, run in PowerShell:

```powershell
$env:REZZO_DEMO_MODE = 'true'
$env:NEXT_TELEMETRY_DISABLED = '1'
npm run dev -- --hostname 127.0.0.1 --port 7340
```

Open `http://127.0.0.1:7340/`. The server displays a demo notice. Use invented details only; demo reservations live in process memory and disappear when the process restarts. No real table is booked or customer email sent. A production build requires both `REZZO_DEMO_MODE=true` and `REZZO_DEMO_PREVIEW=true` to permit this same in-memory preview; the local demo flag alone cannot change normal production behaviour. No production database migrations are needed for this preview.

For the production-built Docker staging package and preview links, see [the staging instructions](docs/STAGING_PREVIEW.md). Staging is a visual/sample-data review, with no live database or notification credentials.

This source update has not been deployed to the live `rezzo.bodhix.io` service. Production continues to need its existing database, staff/session secrets and operational configuration; preserve them separately from source.

## App surfaces

- `/` — guest reservation flow with table-aware availability and policy consent
- `/manage` — booking lookup and cancellation with the 24-hour cutoff
- `/staff/login` — rate-limited staff passcode login
- `/admin` — protected reservations, calendar, arrivals, phone/walk-in bookings, and live floor
- `/waitlist` — QR join page and private live queue ticket, up-next alerts, and table-offer responses
- `/waitlist/sign` — protected, La Chingada-branded letter-size QR notice with print/PDF and QR-download controls

## Admin iPad workover checklist

Every admin workflow must be designed first for front-of-house use during a live service—not treated as a desktop page squeezed onto a tablet.

- [x] Verify every admin screen at 768×1024 portrait and 1024×768 landscape.
- [x] Keep controls, headings, dialogs, and floor elements appropriately scaled; nothing should feel oversized, cramped, or out of place.
- [x] Eliminate page-level horizontal scrolling, sideways drift, clipped content, and competing nested scroll areas.
- [x] Minimize vertical scrolling by using compact information hierarchy, sensible columns, collapsible secondary detail, and fixed primary actions.
- [x] Keep the most-used actions visible and reachable with one tap wherever possible.
- [x] Give staff the fullest practical set of context-aware actions for reservations, tables, walk-ins, arrivals, conflicts, and completed service throughout the night.
- [x] Preserve the live-service time and current operational context unless staff explicitly choose to change it.
- [x] Treat admin login as the only permission gate; operational conflicts should be clear warnings with Cancel and Proceed options.
- [x] Test all workflows for touch targets, accidental swipes, keyboard opening, modal fit, and scroll recovery on iPad Safari.

An admin change is not complete until it meets this checklist without requiring awkward scrolling or extra navigation during service.

PostgreSQL is the source of truth for reservations, layouts, holds, blocks, and service controls. Guest booking runs inside a database transaction and rechecks table availability while the operational state is locked, preventing two guests from claiming the last table.

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

Apply the tracked migrations with:

```powershell
npm run db:migrate
```

Set `DATABASE_URL` first. The operational record uses optimistic revisions for staff changes and row locking for public bookings.

## Staff access

Generate a password hash without storing the passcode in source:

```powershell
npm run auth:hash -- "your private passcode"
```

Copy the output to `STAFF_PASSCODE_HASH`, and set a random `SESSION_SECRET` of at least 32 characters. Staff sessions use signed, HTTP-only, same-site cookies. Both the admin page and staff APIs enforce authentication; the guest header does not expose a staff link.

## QR waitlist and browser push

Copy `.env.local.example` to `.env.local` and fill in:

- `DATABASE_URL`, `SESSION_SECRET`, and `STAFF_PASSCODE_HASH`
- `APP_URL` — a URL the guest's phone can open; use the deployed HTTPS URL in production
- `NEXT_PUBLIC_WAITLIST_ENABLED=true` — rebuild after changing this public flag
- `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`, and `VAPID_SUBJECT` — browser-push credentials

Generate VAPID keys once using the installed `web-push` package. Store the private key only in the
server environment and retain the same pair across deployments. The subject is an HTTPS contact
URL or a `mailto:` contact. No paid messaging provider is required for browser push.

The staff **Waitlist** tab sits between Week Calendar and Service Report:

1. Guests scan the sign and join today's Toronto-service-date queue (maximum six guests).
2. Their private ticket shows their position; order can vary with suitable table availability.
3. **Tell them: Up next** sends a heads-up without holding a table.
4. Staff select a suitable free table and send a five-minute offer. The server protects the
   full turn while the guest chooses yes/no; it checks reservations, seated parties, blocks,
   capacity, and holds transactionally.
5. Acceptance creates a waitlist-sourced booking. The guest has 15 minutes to check in.
   Staff seat the party from the queue or the normal floor controls.
6. Declines, expired offers, and unclaimed arrival grace periods release the table. Deadlines
   are enforced by the server on state reads/mutations, not by a guest countdown or an open tab.

Guest tickets poll every five seconds and remain private; other guests' names and contact details
are never shown. Browser push requires permission, a supported device, HTTPS, and connectivity.
On iPhone, guests must add their private ticket page to the Home Screen and open it there before
enabling alerts. The ticket page explains this and remains the live fallback when push is unavailable.
Staff delivery feedback distinguishes a saved offer from successful submission to the push service;
it does not claim a guest has read the notification. For SMS fallback, configure
`TWILIO_ACCOUNT_SID`, either `TWILIO_AUTH_TOKEN` or `TWILIO_API_KEY` + `TWILIO_API_SECRET`, and
`TWILIO_FROM_NUMBER`; the app sends a text when push is unavailable, but the QR ticket remains the
primary live source of truth.

Print `/waitlist/sign` on letter-size paper in portrait at 100%, with background graphics on and
browser headers/footers off. The QR is generated locally from `APP_URL`; no third-party QR service
receives restaurant or guest information.

## Validation

```powershell
npm test
npm run lint
npm run build
```
