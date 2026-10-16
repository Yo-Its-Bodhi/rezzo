# Production-built staging preview

This package is for a staged visual/demo review of Rezzo. It uses the existing sample state in memory, never a live restaurant database. It is not a production booking rollout.

## Build

The Dockerfile builds Next's standalone Node server and includes public assets and static chunks. It runs as the unprivileged `node` user on container port **3000**.

```sh
docker build \
  --build-arg NEXT_PUBLIC_RESTAURANT_URL=https://restaurant-preview.example/ \
  --build-arg NEXT_PUBLIC_MENU_URL=https://restaurant-preview.example/menu \
  -t rezzo-staging .
```

Both public links are build-time values because the booking flow includes client code. The menu defaults to `/menu` beside the configured restaurant homepage. Set the arguments to the actual staged restaurant URLs when building. These are public URLs, not secrets.

## Start

```sh
docker run --rm \
  -p 127.0.0.1:7341:3000 \
  -e REZZO_DEMO_MODE=true \
  -e REZZO_DEMO_PREVIEW=true \
  rezzo-staging
```

The parent deployment task owns reverse-proxy access and the public owner-preview URL. No deployment was performed by this package-preparation task.

- **Both exact server flags are required** in `NODE_ENV=production`. Missing either retains the real database path and existing staff protection.
- The prominent server-rendered **DEMO PREVIEW / SAMPLE DATA ONLY** notice appears on all pages in this mode. It is evaluated at request time, including on a production-built server.
- Use made-up names and contacts only. Demo reservations are shared process memory and reset on restart; use one replica for a coherent review session.
- No real table is booked. Outbound push/SMS are disabled in demo mode even if notification settings are accidentally present. Guest reservation code sends no customer email.
- Do not supply `DATABASE_URL`, live session/staff secrets, VAPID keys, Twilio credentials, production volumes or customer-data exports. No database, messaging or staff-login setup is needed for this visual preview.
- The existing demo permits the sample staff view. It is not a replacement for live staff authentication, which remains unchanged outside demo mode.
- `.dockerignore` excludes local environment files, dependencies, Git state, build output, keys, database files and common backup formats. No automatic migration command runs in the image.

## Validation

Tests exercise the actual state-store branch: normal production and either single flag still select the real adapter, while both flags select only in-memory state, even with an unused database URL present. A notification regression asserts that neither push nor SMS is submitted in production-preview mode. Public-link tests cover defaults, staged origins, menu overrides and unsafe URL rejection.

Fresh checks on 15 October 2026: **145 tests passed in 16 files**, ESLint and TypeScript passed, and the standalone production build passed. The built Node server was smoke-tested in both modes: preview notice present on home, management and 404 pages with both flags; absent with the local flag alone. Preview availability returned 200 with sample slots, CSS/photo assets returned 200, and default-production `/admin` redirected to staff login. These checks submitted no reservation and contacted no database or notification provider.

Container-engine validation must run on a Docker-enabled host; this Windows workspace does not have a Docker CLI. The local production build and standalone Node smoke check passed; the parent task owns the final image build and hosting checks.
