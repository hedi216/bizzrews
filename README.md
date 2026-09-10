# BizzRes

BizzRes is an API-first modular monolith foundation. The independent NestJS REST API will support web, mobile, embedded widgets, and integrations as the product evolves. No business features, authentication, or domain models are implemented yet.

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

The API defaults to port 4000. `GET http://localhost:4000/api/v1/health` returns `{"status":"ok"}` without a database. The web application runs at http://localhost:3000. The API uses URI versioning, security headers, port validation, and graceful shutdown hooks. Cross-origin access policy will be configured when a real frontend integration requires it.

## Environment and PostgreSQL

Local development targets PostgreSQL 17 at `localhost:5432`, database `bizzres_dev`, application role `bizzres_app`, schema `public`. Service `postgresql-x64-17` was running and accepting connections during setup, but administrator authentication required an unavailable password. Role/database creation was not attempted; their existence and application connectivity are not yet verified. No migrations or domain tables have been created.

Root `.env` is the single local backend/database environment file and is ignored by Git. An empty DATABASE_URL placeholder has been prepared; on a fresh checkout, copy `.env.example` to `.env`. API and connectivity-check scripts load it using Node's environment-file support. Prisma 7 CLI loads the same file with dotenv in `packages/database/prisma.config.ts`, resolved relative to that config rather than the working directory. Existing process environment variables take precedence. Never commit DATABASE_URL or duplicate it into the web environment. `.env.example` remains documentation only.

Administrator access is needed next. In your own PowerShell window, run:

```powershell
& 'C:\Program Files\PostgreSQL\17\bin\psql.exe' -X -W -h localhost -p 5432 -U postgres -d postgres
```

Enter the existing administrator password only in the hidden local prompt; do not paste it into chat or source files. An authenticated administrator must then create or verify `bizzres_app` as a LOGIN role with NOSUPERUSER, NOCREATEROLE, NOREPLICATION and NOBYPASSRLS, and create or verify `bizzres_dev` owned by that role. Do not alter existing objects without checking their ownership and intended use. Set a strong unique local role password using psql's non-echoed `\password bizzres_app` command, then configure root `.env` privately with the application URL. Percent-encode reserved password characters in the URL. Never use the administrator account in the application URL.

Prisma `migrate dev` also needs a shadow database: before the first future migration, explicitly choose either local-only CREATEDB permission for `bizzres_app` or a separately provisioned dedicated shadow database. Ownership of `bizzres_dev` alone does not grant shadow-database creation. No such permission or shadow database has been created in this step.

Production database credentials must be completely separate from local development credentials. Production migration privileges should be planned separately from application runtime privileges.

Next.js uses its own environment-file convention: when needed, create ignored `apps/web/.env.local` containing only web-specific settings such as `NEXT_PUBLIC_API_URL=http://localhost:4000/api/v1`. Never put DATABASE_URL in the web environment. Values prefixed with NEXT_PUBLIC_ are public and embedded at build time. The placeholder page does not call the API yet.

```sh
npm run db:generate  # Generate client locally; no database required
npm run db:check     # Read-only SELECT 1; requires configured access
npm run db:migrate   # Future use only: requires a valid DATABASE_URL
npm run db:studio    # Requires a valid DATABASE_URL
```

Prisma 7 stores the datasource URL in `packages/database/prisma.config.ts`; the schema declares the PostgreSQL provider and generator only. Generated client code is ignored and recreated by generation/build/typecheck. Migration and Studio scripts refuse to run with an empty URL. Do not run migrations until database setup and the first domain model are explicitly agreed. Review migration changes and any reset prompt before proceeding.

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
