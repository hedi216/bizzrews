# BizzRes

BizzRes is an API-first modular monolith foundation. The independent NestJS REST API will support web, mobile, embedded widgets, and integrations as the product evolves. The first booking schema contains nine models; no business APIs, authentication, or business UI are implemented.

## Structure

```text
apps/api/           NestJS API; modules own their endpoints and behavior
apps/web/           Next.js App Router; future app.bizzres.com
packages/database/ PostgreSQL Prisma schema and client factory; server-only
packages/shared/   Framework-independent TypeScript; intentionally empty
assets/            Reserved official brand assets; do not modify casually
```

A separate marketing website for www.bizzres.com may be introduced later. The API does not depend on Next.js. Keep React and NestJS code out of shared. The API's `DatabaseModule` exports a singleton `DatabaseService` using `@bizzres/database`; future backend modules should import that module and reuse its service. Do not create clients per request or in frontend applications.

## Local tools and installation

- Node.js 24.15 or newer within the 24.x LTS line
- npm 11.x
- Git recommended
- Local PostgreSQL (17.10 detected); Docker is not used

Run commands from the repository root:

```sh
npm install
npm run dev:api
npm run dev:web
# Or start both:
npm run dev
```

On Windows, if PowerShell blocks `npm.ps1`, use `npm.cmd` in place of `npm`. No execution-policy change is necessary. All tools are project-local; the repository uses npm workspaces and one root package-lock.json. Use `npm ci` for reproducible installs once the lockfile exists.

The API defaults to port 4000. `GET http://localhost:4000/api/v1/health` returns `{"status":"ok"}` without a database. The web application runs at http://localhost:3000. The API uses URI versioning, security headers, port validation, graceful shutdown hooks, and credentialed CORS restricted to `CORS_ORIGIN`.

## Environment and PostgreSQL

Local development uses PostgreSQL 17 at `localhost:5432`, database `bizzres_dev`, application role `bizzres_app`, schema `public`. The role owns the development database and retains NOSUPERUSER, NOCREATEDB, and NOCREATEROLE. The local Windows service is `postgresql-x64-17`.

Root `.env` is the single local backend/database environment file and is ignored by Git. It holds DATABASE_URL and SHADOW_DATABASE_URL; neither value belongs in source control or the web environment. API and connectivity-check scripts load it using Node's environment-file support. Prisma 7 CLI loads the same file with dotenv in `packages/database/prisma.config.ts`, resolved relative to that config rather than the working directory. Existing process environment variables take precedence. `.env.example` contains empty documentation placeholders only.

Prisma development migrations require a separate disposable `bizzres_shadow` database owned by `bizzres_app`. Provisioning that database requires temporary administrative access; subsequent migrations use only `bizzres_app`. Administrator credentials must be entered through a local non-echoed password prompt, kept only in process memory, and never stored in the repository or `.env`. Do not grant CREATEDB or SUPERUSER to the application role or change PostgreSQL authentication settings.

SHADOW_DATABASE_URL uses the existing application's connection credentials but names `bizzres_shadow`. Prisma 7 reads it through `datasource.shadowDatabaseUrl` in `prisma.config.ts`. Prisma replays migration history in this disposable database; it must never point to the development database or contain unrelated data. The migration command checks both URLs against the approved local database names before invoking Prisma.

Production database credentials must be completely separate from local development credentials. Production migration privileges should be planned separately from application runtime privileges.

Next.js uses its own environment-file convention: when needed, create ignored `apps/web/.env.local` containing only web-specific settings such as `NEXT_PUBLIC_API_URL=http://localhost:4000/api/v1`. Never put DATABASE_URL in the web environment. Values prefixed with NEXT_PUBLIC_ are public and embedded at build time. The placeholder page does not call the API yet.

Account authentication uses email and password for BizzRes platform users. Configure `JWT_ACCESS_SECRET` only in the ignored root `.env`; it must contain at least 32 bytes of unpredictable material. `JWT_ACCESS_TTL_SECONDS` defaults to 900, `AUTH_REFRESH_TTL_DAYS` defaults to 30, and `CORS_ORIGIN` identifies the single trusted web origin (`http://localhost:3000` locally). Keep the placeholder secret empty in `.env.example`.

Registration and login return a short-lived bearer access token. The opaque rotating refresh token is stored only in the `bizzres_refresh` HttpOnly, SameSite=Lax cookie scoped to `/api/v1/auth`; only its SHA-256 secret hash is stored in PostgreSQL. The cookie is Secure in production. Logout revokes the refresh session and clears the cookie, while an already-issued access token may remain valid until its approximately 15-minute expiry. The initial implementation has no email verification, password reset, OAuth, or MFA. Its auth rate limiter is process-local and must move to a shared store before running multiple API instances.

Authenticated platform users can call `POST /api/v1/organizations` to atomically create an Organization, their active OWNER membership, and the first Business. Business slugs are globally unique, the initial marketplace visibility is `UNLISTED`, timezones use IANA identifiers, and default currencies use uppercase three-letter codes. `GET /api/v1/organizations` returns the caller's active organization memberships and their current non-archived Businesses.

Active organization members can read Businesses and Experiences through `GET /api/v1/organizations/:organizationId/businesses`, `GET /api/v1/businesses/:businessId`, `GET /api/v1/businesses/:businessId/experiences`, and `GET /api/v1/experiences/:experienceId`. OWNER and MANAGER members can create or update Businesses and create Experiences through the corresponding `POST`/`PATCH` endpoints. Creating an Experience also creates its unpublished version-1 draft atomically; draft content is edited with `PATCH /api/v1/experiences/:experienceId/draft`, while `PATCH /api/v1/experiences/:experienceId` changes only its slug. Monetary values use decimal strings, and STAFF membership is read-only.

Active members read occurrences through `GET /api/v1/experiences/:experienceId/occurrences` and `GET /api/v1/occurrences/:occurrenceId`. OWNER and MANAGER members create and update occurrences, cancel empty occurrences, and open or close reservations through the corresponding domain-action endpoints. Occurrence times are explicit instants and retain their IANA timezone.

Direct public booking links use `GET /api/v1/public/businesses/:businessSlug/experiences/:experienceSlug`; future availability is exposed by its `/occurrences` child and guest reservation submission by its `/reservations` child. Reservation creation validates published custom questions, creates server-owned snapshots, and locks occurrence capacity transactionally. The published revision price is the reservation total in this first version and is not multiplied by participant count.

Active members list and read reservations through `GET /api/v1/experiences/:experienceId/reservations` and `GET /api/v1/reservations/:reservationId`. OWNER and MANAGER members cancel with `POST /api/v1/reservations/:reservationId/cancel`; cancelled reservations stop consuming occurrence capacity.

BizzRes supports both explicit occurrences and generated appointment slots. A published Experience revision selects `EXPLICIT_OCCURRENCES` or `GENERATED_SLOTS`; generated scheduling fixes duration, slot interval, and buffers in the immutable revision. Business-owned Resources are assigned to Experiences and configured through full-replacement weekly availability plus date overrides.

Authenticated scheduling endpoints are available under `/api/v1/businesses/:businessId/resources`, `/api/v1/experiences/:experienceId/resources`, and `/api/v1/resources/:resourceId`. Direct-link clients request generated availability from `GET /api/v1/public/businesses/:businessSlug/experiences/:experienceSlug/slots?date=YYYY-MM-DD`, optionally filtering by `resourceId`.

Generated reservations submit `booking.slot.resourceId` and an absolute `booking.slot.startAt`; explicit reservations continue to submit `booking.occurrenceId`. Generated slots are recalculated inside the booking transaction, serialized per Resource with a PostgreSQL advisory transaction lock, checked against historical revision buffers, and materialized as capacity-one Occurrences only when booked.

OWNER and MANAGER members configure draft questions through `POST`, `PATCH`, and `DELETE /api/v1/experiences/:experienceId/draft/fields`, with option mutations under `.../fields/:fieldId/options`. `POST /api/v1/experiences/:experienceId/publish` atomically freezes the current revision and makes it authoritative without enabling reservations. `POST /api/v1/experiences/:experienceId/draft` then clones the published revision, fields, and options into the next editable version. The lifecycle is draft → publish → immutable revision → next draft.

```sh
npm run db:generate  # Generate client locally; no database required
npm run db:check     # Read-only SELECT 1; requires configured access
npm run db:migrate   # Requires both approved local databases and their URLs
npm run db:studio    # Requires a valid DATABASE_URL
npm run test:integrity -w @bizzres/database # Database tests; all fixtures roll back
```

Prisma remains centralized in `packages/database`. Generated client code is ignored and recreated by generation/build/typecheck. Schema changes use migration history; never use `db push` or destructive reset commands. Generate a draft migration with `npm run migrate -w @bizzres/database -- --create-only --name <name>`, inspect its SQL and custom constraints, then apply the reviewed migration with `npm run db:migrate`. Do not edit a migration after it has been applied.

The applied `initial_booking_domain` migration creates exactly User, Organization, OrganizationMember, Business, Experience, ExperienceRevision, Occurrence, Reservation, and ReservationEvent. Prisma's `_prisma_migrations` table is metadata, not a domain table. Organization is the tenant boundary; Business is the public/commercial entity. Reservations are booking-specific and retain mandatory customer identity snapshots.

The migration's SQL adds tenant-aware foreign keys, CHECK constraints, published-revision immutability, draft-publication rejection, and append-only reservation events. Published revisions reject every later UPDATE, including changes to Prisma's `updatedAt`, and DELETE; the first publication update remains valid. These triggers protect ordinary DML, not an administrator deliberately disabling constraints. Do not add custom-form, scheduling, resource, payment, or order models in this first slice.

The integrity test command is restricted to local `bizzres_dev`. It uses savepoints to verify exact SQLSTATE/constraint failures, rolls back all fixture changes, and verifies table counts are unchanged. It does not test business authorization, capacity-locking services, email normalization, or IANA timezone validation; those application behaviors are deferred.

PostgreSQL tools were found at `C:\Program Files\PostgreSQL\17\bin` but were not on PATH. Use the full executable path or add this directory to your own PATH when database setup is needed.

Start the API with `npm run dev:api`, then test:

```sh
curl http://localhost:4000/api/v1/health
curl -i http://localhost:4000/api/v1/health/database
```

Process health returns HTTP 200 with `{"status":"ok"}` independently of PostgreSQL. Database health runs only `SELECT 1`: it returns HTTP 200 with `{"status":"ok","database":"reachable"}` on success, or HTTP 503 with `{"status":"error","database":"unavailable"}` when unconfigured or unavailable. Connection strings and internal errors are not returned. Restart the API after editing environment configuration.

The service connects during initialization when configured, allows the API to start if the database is unavailable, reuses that client for recovery, and disconnects on application shutdown. Prisma 7 pooling is configured on the pg adapter: at most five connections per API process, a three-second connection/acquisition timeout, a thirty-second idle timeout, and five-second statement/query timeouts. These are conservative initial runtime limits; review them with actual workloads and budget total connections across all API replicas plus migrations and administration before scaling. No PgBouncer is introduced. See [Prisma connection management](https://www.prisma.io/docs/orm/prisma-client/setup-and-configuration/databases-connections).

## Quality and production builds

```sh
npm run lint
npm run typecheck
npm run format
npm run format:check
npm run build
npm run test -w @bizzres/api
npm run start -w @bizzres/api
npm run start -w @bizzres/web
```

Strict TypeScript applies across workspaces. API build/typecheck scripts first generate and build the shared database package, including when run directly. Lifecycle tests use mocks and require no PostgreSQL credentials. Formatting and linting exclude assets and generated output. Keep official assets unchanged unless a future task explicitly authorizes a change. The assets folder was empty during initialization, so the web page uses text only.

Future booking, event, request, registration, rental, and order flows belong in focused backend modules once designed. Forms, products, payments, and providers remain future work; this foundation introduces no provider coupling or premature abstractions.

## Dependency audit

The non-mutating audit still reports seven high-severity package findings (including affected parent packages):

- `apps/api`: direct `@nestjs/core` and `@nestjs/platform-express`, through `multer`. This is a production runtime dependency chain, not NestJS development tooling. The scaffold has no multipart upload routes, so the reported upload paths are not currently exposed.
- `packages/database`: development dependency `prisma`, through `@prisma/config` → `deepmerge-ts` and Prisma's `mysql2`. These are Prisma CLI/tooling chains, not the application's PostgreSQL adapter/client runtime. No MySQL connection is configured.
- No separate high-severity chain was reported for Next.js or `packages/shared`.

`npm audit --omit=dev` also reports all seven findings: `@prisma/client` declares Prisma as an optional peer, so npm includes the CLI chain in the production dependency inventory despite its development declaration. Do not assume these packages disappear from production installs; assess the actual deployment artifact in the separate dependency-security step. The API does not import Prisma CLI or its MySQL driver.

No audit fixes or framework upgrades were applied. Findings remain unresolved for a separate dependency-security step. Do not run `npm audit fix --force`.
