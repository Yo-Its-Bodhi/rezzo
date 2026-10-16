# Customer reservation makeover

14 October 2026. Local review source; no live deployment, production migration, customer-data transfer or real reservation submission was performed by this implementation task. The parent task handles GitHub publication and browser QA.

## Design and flow

The booking and management pages use the restaurant's shared corn mark, Barlow Condensed/DM Sans, marigold `#ffbd18`, chile `#bd3026`, teal `#006d70`, ink `#25231e` and white. Real taco and dining-room photos and font licences were copied from the current restaurant checkout. Favicons and Apple touch artwork match. Fonts are local; the build no longer fetches Google fonts.

The reservation form has a three-step indicator, clearly labelled party/date/time controls, concise house-rule reminders, original full policies and deliberate consent. It preserves guest input when returning to times, focuses the next step heading, guards duplicate clicks and cancelled availability requests, refreshes availability after a conflict, offers load retries and phone help, and avoids silently repeating a booking when a network failure makes the result uncertain. The final confirmation appears only after the server returns a real confirmation code.

Management retains contact/code verification and the existing 24-hour cutoff. It adds loading/error feedback, Toronto-time labels, success messages and a reversible confirmation before cancellation. Failed changes retain the current booking. No staff, auth, table assignment, availability, waitlist, push, database or API business logic was changed.

The original rules remain: maximum six online guests, two-hour tables, 15-minute arrival grace, patio walk-ins only, 50% of the party present before seating, changes 24 hours ahead, separate tables for separate bookings, and one bill/18% auto-gratuity for six. These remain sourced from `src/lib/restaurant.ts`.

## Local preview

```powershell
$env:REZZO_DEMO_MODE = 'true'
$env:NEXT_TELEMETRY_DISABLED = '1'
npm run dev -- --hostname 127.0.0.1 --port 7340
```

Preview: `http://127.0.0.1:7340/`; management: `/manage`.

The server-derived demo notice appears only when `isDemoMode()` is true: non-production plus `REZZO_DEMO_MODE=true`, or an explicitly opted-in production preview with both `REZZO_DEMO_MODE=true` and `REZZO_DEMO_PREVIEW=true`. State reads/writes then use `globalThis.__rezzoDemoState` and the memory lock rather than the PostgreSQL transaction. The PostgreSQL client is lazy. Guest reservation API code performs no email/SMS send; the page does not promise an emailed receipt. Use a made-up name, reserved 555 phone and `example.invalid` email for any deliberate demo journey. Demo mode uses the existing sample staff view; normal production staff authentication still requires its private configuration. No credentials were copied.

## Verification

- 133 tests passed in 14 files, including three new Toronto-calendar tests covering UTC rollover, daylight-saving changes and leap/year boundaries.
- ESLint passed with no warnings or errors.
- TypeScript `tsc --noEmit` passed.
- Production build passed on Next 16.4.1.
- Production dependency audit reports zero vulnerabilities after the security refresh.

The browser pass is owned by the parent task; this file does not claim physical phone/iPad verification or a real customer booking. The customer styles are scoped so the existing staff floor-control layout remains intact.

## Dependency work and remaining limits

Next and matching `eslint-config-next` were updated from 16.3.0 to 16.4.1, following the npm advisory's non-major fix. Ordinary `npm audit fix` updated compatible transitive dependencies, including the current Vitest patch. No forced upgrades or breaking downgrade were applied.

Five high development-tool reports remain in a single dependency chain: `braces` → `micromatch` → `fast-glob` → `@next/eslint-plugin-next` → `eslint-config-next`. The current advisory covers all braces versions, and npm's offered remediation is a breaking downgrade to Next ESLint config 14.2.35. That would mismatch this application's Next 16 release. It was deliberately not applied; production audit is clean. Track the upstream parser/tooling fix. Advisory: https://github.com/advisories/GHSA-vfj7-8cjw-p6xm.

The existing PostgreSQL schema/migrations, operational state, staff passcode/session secrets and external notification configuration remain separate from GitHub source. Do not point the demo at the live database or use its preview flags for a real booking service. The live `rezzo.bodhix.io` service has not been changed by this task.

## Production-built staging follow-up

15 October 2026: a standalone Docker package was added for the owner’s visual/sample-data staging review, with the explicit dual server-flag protection, global demo notice and configurable public restaurant/menu links. All 145 tests, lint, TypeScript, production build and local standalone HTTP smoke checks pass. The default production adapter and staff gate remain protected; demo outbound notifications are suppressed. See [the staging handoff](STAGING_PREVIEW.md). No container engine is installed in this workspace, so the parent task owns the final Linux image build and hosting checks.
