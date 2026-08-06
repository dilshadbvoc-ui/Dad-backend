# Dad-backend — CLAUDE.md

This file is auto-loaded for every Claude Code session working inside `Dad-backend/`. It is a verified map of the
codebase (built by reading the actual source, not the aspirational docs). Read this before exploring — it should
save you from re-deriving things that are already known.

## Overview

`Dad-backend` (`package.json` name: `pype-server`) is the Node.js/Express/Prisma/PostgreSQL API server for PypeCRM,
a multi-tenant CRM. Stack: **Express 4.18**, **Prisma 5.22** (`@prisma/client` 5.22, generated client output is
**not** the default `node_modules/.prisma` location — see below), **PostgreSQL**, **TypeScript 5.3** compiled with
plain `tsc` (no bundler), **Socket.io** for realtime, **node-cron** for scheduled jobs, **Passport** (SAML) for SSO,
**Stripe** for billing, **Twilio/WhatsApp(Meta)/Gallabox** for messaging, **Cloudinary** for media.

Multi-tenancy model: every tenant is an `Organisation` row. Almost every domain model carries an `organisationId`
foreign key (`onDelete: Cascade` from `Organisation`). There is no Postgres row-level security — isolation is
enforced entirely in application code (controllers filtering by `organisationId`, plus the `getOrgId`/visibility
helpers in `hierarchyUtils.ts`). **There is no automatic ORM-level tenant scoping** — a controller that forgets to
filter by `organisationId` will leak cross-tenant data. `super_admin` and `admin` roles bypass org/user scoping in
several helpers (see Auth section).

## Running & tooling

All commands run from `Dad-backend/`:

- `npm run dev` — `tsx watch src/index.ts` (hot-reload dev server, entrypoint is `src/index.ts`).
- `npm run build` — compiles with `tsc` directly (`node --max-old-space-size=3072 node_modules/typescript/bin/tsc`), not via `ts-node`. Output goes to `dist/` (see `tsconfig.json`: `rootDir: src`, `outDir: dist`).
- `npm run postbuild` — runs `copy-prisma.js` (copies the generated Prisma client into `dist/` since Prisma's output path is inside `src/generated/client`, not `node_modules`).
- `npm start` — `node dist/index.js` (production, run **after** build).
- `npm run migrate` — `npx prisma db push --accept-data-loss && npx prisma generate`. **Note: this project uses `db push`, not `prisma migrate dev` — there is no `prisma/migrations` history to inspect.** Be careful: `--accept-data-loss` is baked into the script.
- `npm run studio` — `prisma studio --port 5555`.
- `npm run seed` — `ts-node src/scripts/seed.ts`.
- `npm run lint` — `eslint src/**/*.ts`. **Gotcha:** there are TWO eslint configs at the root — `.eslintrc.js` (legacy format, TS-only rules, this is what ESLint 8.x actually uses by default) and `eslint.config.js` (flat config, but it's a leftover **frontend/Vite** config referencing `reactHooks`/`reactRefresh`/browser globals — it is not appropriate for this Node backend and is likely dead weight, not the one actually driving `npm run lint`).
- **No test script exists in `package.json` and no test runner dependency (jest/vitest/mocha) is installed.** Do not assume tests exist; `tsconfig.json` even excludes `**/*.spec.ts` / `**/*.test.ts`. If asked to "run the tests," there is nothing to run — flag this rather than guessing.
- `postinstall` runs `npx prisma generate && node copy-prisma.js` automatically on `npm install`.
- Prisma client generator output is customized: `generator client { output = "../src/generated/client" }` in `prisma/schema.prisma` — i.e. `import prisma from '../generated/client'`, not `@prisma/client` directly, in most files. `src/config/prisma.ts` is the actual singleton import point for everything else (`import prisma from '../config/prisma'`).
- Package manager: both `package-lock.json` and `pnpm-lock.yaml`/`pnpm-workspace.yaml` are present — unclear which is authoritative; `npm install` works per the scripts above.

## Directory map (`src/`)

```
src/
  index.ts            Entrypoint. Express app setup, ALL route mounting, CORS/helmet/session config,
                       cron init gate, Socket.io init, global error handler, SPA static-file fallback.
  socket.ts            Socket.io server setup + emitToOrg/emit helpers for realtime push (notifications, leads).
  meta-ads-daily-poll.js  Standalone JS script (not part of the app boot) for a Meta Ads polling job — check
                       before assuming it's dead; it's plain JS living alongside the TS app.
  types.d.ts          Minimal ambient type declarations.
  generated/client/   Prisma-generated client (custom output path — see above). Do not hand-edit.
  config/
    prisma.ts          Prisma client singleton(s). Exports `prisma` (main pool, uses DATABASE_URL's
                        connection_limit) AND `cronPrisma` (a SEPARATE client hard-capped at
                        connection_limit=3 so cron jobs can never starve API request connections). Cron
                        code should import `cronPrisma`, not `prisma`.
    cloudinary.ts       Cloudinary SDK config for media uploads.
  routes/              ~65 route files, one per domain. Thin — just wires `express.Router()` to controller
                       functions plus middleware (protect/admin/authorize/checkPlanLimits). See API surface below.
  controllers/         ~65 controller files. This is where almost all business logic actually lives (see
                       "Real architectural pattern" below). Includes the `shuffler-module/` subfolder.
  services/            Business-logic modules that ARE properly extracted (see below for which). Includes a
                       `shuffler-module/` subfolder (mirrors the one in controllers/scripts).
  middleware/          auth, rate limiting, CSRF, security audit, data isolation, subscription/license
                       gating, super-admin protection, validation.
  utils/               Shared helpers — hierarchyUtils.ts (RBAC/visibility, see below), roleUtils.ts,
                       apiResponse.ts, auditLogger.ts, encryption.ts, envValidator.ts, logger.ts,
                       passwordValidator.ts, webhookSecurity.ts, callUtils.ts, generateToken.ts.
  scripts/             ~90 one-off/maintenance/debug TypeScript scripts (seed, backfills, Meta Ads
                       debugging one-offs like `check_meta_*.ts`, `check_campaign_*.ts`, password resets,
                       lead-status migrations). Not wired into the app; run manually with ts-node/tsx.
                       Mostly ad-hoc investigation scripts from past debugging sessions — treat as
                       reference/history, not living code. Contains its own `shuffler-module/` with a
                       `test-shuffler.ts` script.
  scratch/             Ad-hoc debug scripts (dedup checks, brace-matching, follow-up sync). NOISE — see below.
```

## Database schema summary (`prisma/schema.prisma`, ~1817 lines)

Datasource: PostgreSQL. Generator output: `../src/generated/client`. IDs are UUID strings everywhere
(`@id @default(uuid())`). Soft-delete convention: `isDeleted Boolean @default(false)` + `deletedAt DateTime?`
on most (not all — e.g. `Notification`, `WorkflowQueue`, `CallRecording` have no soft delete) tenant models.

**Identity / Org**
- `Organisation` — the tenant root. Holds plan-ish limits (`userLimit`, `contactLimit`, `storageLimit`), branding, `subscription` (Json), `integrations` (Json — Meta/WhatsApp/etc connection state), `leadScoringConfig`, `leadStatuses`/`opportunityLeadStatuses` (custom pipeline stage config as Json), `shufflerConfig` (Json — drives the shuffler cron), `dailyReportTime`/`dailyReportEmailEnabled` (per-org scheduled report).
- `User` — has `role` as a **plain string** (not an enum — "dynamic roles", see `Role` model), `reportsToId` self-relation (management hierarchy), `teamId`/`branchId`, `permissions String[]` (direct overrides), `dailyLeadQuota`, `isOffDuty`, `isPlaceholder`.
- `Team`, `Branch` — secondary grouping/hierarchy dimensions, each with a manager.
- `Role` — dynamic RBAC: `roleKey` + `permissions String[]`, `isSystemRole`, scoped per-`organisationId` (nullable = global template).
- `License`, `SubscriptionPlan` — licensing/billing tied to org.
- `ApiKey` — hashed (`keyHash`) org-scoped API keys for the public `/api/v1` surface.

**CRM Core**
- `Lead` — the primary inbound record. `source` is a `LeadSource` enum (website/referral/social/paid_ad/import/api/manual/whatsapp/meta_leadgen/cold_call/...). Scoring fields (`leadScore`/`engagementScore`/`qualityScore`/`isHotLead`), re-enquiry tracking (`isReEnquiry`/`reEnquiryCount`/`originalLeadId`), rotation-violation tracking (`rotationViolation`/`violationTime`/`userExplanation`/`managerExplanation`) tied to the round-robin/shuffler system, `assignedToId`/`previousOwnerId`, `pipelineId`. **Unique constraint: `[phone, organisationId, branchId]`** — duplicate detection is phone+org+branch scoped.
- `LeadHistory` — audit trail of ownership/field changes per lead.
- `LeadProduct` — line items of interest attached to a lead pre-conversion.
- `Account`, `Contact`, `Opportunity` — standard CRM entities, each with `ownerId` + `previousOwnerId` + `organisationId`. `Lead` converts into `Account`/`Contact`/`Opportunity` via nullable back-reference FKs (`convertedAccounts`, etc. — a Lead can spawn all three).
- `Opportunity.closeDate` — **nullable, client-supplied** (see Gotchas — not server-derived).
- `Opportunity.type` — `OpportunityType` enum (`NEW_BUSINESS` | `UPSALE`), used for sales-target scoping.
- `Pipeline` — org-defined stage config (`stages Json`) referenced by both `Lead` and `Opportunity`.
- `CallRecording` — standalone call-audio records tied to a `Lead` (Android app upload target).
- `Interaction` — unified activity-log entity (call/email/meeting/note/whatsapp) with call-dedup fields (`hardwareId`, `callSessionId` — unique per org) used to reconcile Android call-log syncs.
- `Task`, `FollowUp` — near-identical shape (dup'd rather than shared) — both have `notifiedAt` (legacy) plus split `notified30MinAt`/`notifiedDueAt` reminder tracking.
- `CalendarEvent`, `CheckIn` (geo check-ins), `Case` (support tickets).
- `Territory`, `AssignmentRule` (round-robin/lead-distribution rule engine — `ruleType`, `distributionType`, `rotationPool`, `enableRotation`), `CustomField` (dynamic per-org per-entity fields).

**Payments / EMI**
- `EMISchedule` (1:1 with `Opportunity`) → `EMIInstallment[]` → `PaymentRecord[]`. `PaymentType` enum (`full`/`partial`/`installment`). `EMIStatus` (active/completed/cancelled/defaulted), `InstallmentStatus` (pending/paid/overdue/cancelled/missed).
- `Opportunity.paymentStatus`/`paymentDate` — a simpler pending/partial/paid summary field distinct from the full EMI subsystem.
- `Commission` — sales-rep commission ledger tied to a `dealId` (loose string ref, not FK).

**Commerce**
- `Product`, `AccountProduct` (installed-base tracking per account), `Quote`/`QuoteLineItem`, `ProductShare` (public shareable product links with view counts).

**Marketing / Communication**
- `Campaign`, `EmailList`, `SMSCampaign`/`SMSTemplate`, `WhatsAppCampaign`/`WhatsAppMessage` (conversation-threaded, dedup'd by `waMessageId`), `WebForm`, `LandingPage`, `Webhook` (outbound), `Workflow`/`WorkflowRule`/`WorkflowQueue` (a queued, delayed-execution automation engine — `WorkflowQueue` rows are polled every minute by cron), `ImportJob` (CSV import tracking).

**System**
- `Notification`, `AuditLog`, `SearchHistory`, `Document` (supports storing file bytes directly in Postgres via `fileData Bytes?`, as well as `fileUrl`), `CallSettings` (1:1 per-org), `UserLeadQuotaTracker` (per-user-per-day lead cap enforcement), `SystemSetting`, `SiteFAQ` (marketing site content, not tenant-scoped).

**Enums**: `LeadSource`, `LeadStatus` (defined but note `Lead.status` is actually a plain `String`, not this enum — the enum looks unused/aspirational), `TaskStatus`/`TaskPriority`, `FollowUpStatus`/`FollowUpPriority`, `InteractionType`/`InteractionDirection`, `OpportunityType`, `TargetScope`, `PricingModel`, `EMIStatus`, `InstallmentStatus`, `PaymentType`.

## API surface (mounted in `src/index.ts`)

All mounted under `/api/*` unless noted. `verifyCSRFToken` is applied to a handful of routers explicitly (reports, analytics, workflow, email) — most are not CSRF-protected at the router level.

| Route file | Base path | Covers |
|---|---|---|
| `authRoutes` | `/api/auth` | login/register/refresh/password reset |
| `analyticsRoutes` | `/api/analytics` | dashboard stats, funnels (see `analyticsController`) |
| `leadRoutes` | `/api/leads` | CRUD + bulk create/assign, violations/explanation (rotation-violation workflow), convert, re-enquiries, duplicates, AI response generation, Gallabox sync |
| `contactRoutes`, `accountRoutes`, `opportunityRoutes` | `/api/contacts`, `/api/accounts`, `/api/opportunities` | standard REST CRUD |
| `paymentRoutes`, `emiRoutes` | `/api` (no extra prefix — routes define full path e.g. `/opportunities/:id/payments`) | payment records + EMI schedules/installments |
| `campaignRoutes`, `marketingRoutes`, `emailListRoutes` | `/api/campaigns`, `/api/marketing`, `/api/marketing/lists` | email campaigns |
| `interactionRoutes`, `callRoutes`, `callSettingsRoutes`, `telephonyRoutes` | `/api/interactions`, `/api/calls`, `/api/call-settings`, `/api/telephony` | activity logging, call recordings, telephony provider config |
| `checkInRoutes`, `eventRoutes`, `taskRoutes`, `followUpRoutes` | `/api/checkins`, `/api/calendar`, `/api/tasks`, `/api/follow-ups` | field ops |
| `productRoutes`, `quoteRoutes`, `shareRoutes`, `documentRoutes` | `/api/products`, `/api/quotes`, `/api/share`, `/api/documents` | commerce |
| `caseRoutes` | `/api/cases` | support tickets |
| `goalRoutes`, `workflowRoutes`, `pipelineRoutes`, `webFormRoutes`, `smsCampaignRoutes`, `whatsAppCampaignRoutes`, `whatsAppRoutes`, `commissionRoutes`, `landingPageRoutes`, `notificationRoutes`, `androidRoutes`, `salesTargetRoutes`, `teamRoutes`, `adRoutes` | matching `/api/*` | see filenames — `androidRoutes` is the mobile-app-specific ingest endpoint (call recording upload, call-log sync, has its own in-memory per-user rate limiter for bulk sync) |
| `metaAuthRoutes` | `/api/meta` | Meta/Facebook OAuth + integration management (large file, 27KB) |
| `userRoutes`, `roleRoutes`, `territoryRoutes`, `customFieldRoutes`, `webhookRoutes`, `assignmentRuleRoutes`, `hierarchyRoutes`, `organisationRoutes`, `apiKeyRoutes`, `branchRoutes`, `bulkRoutes`, `publicRoutes`, `trashRoutes` | `/api/*` | admin/settings; `hierarchyRoutes` exposes the reporting-tree helpers; `trashRoutes` is soft-delete recovery |
| `subscriptionPlanRoutes`, `licenseRoutes`, `superAdminRoutes`, `backupRoutes` | `/api/plans`, `/api/licenses`, `/api/super-admin`, `/api/backup` | platform-level (cross-tenant) admin — `superAdminRoutes` includes full platform data export/restore, org suspend/delete, global role templates |
| `auditRoutes`, `timelineRoutes` | `/api/audit-logs`, `/api/timeline` | read-only audit views |
| `apiRoutes` | `/api/v1` | **the public, API-key-authenticated integration surface** (`verifyApiKey` middleware, not JWT) — e.g. `POST /api/v1/leads` for external lead ingestion with heavy field-normalization/fallback logic |
| `stripeRoutes` | `/api/stripe` | billing |
| `debugRoutes` | `/api/debug` | debug endpoints — check before trusting in prod |
| `sitemapRoutes` | `/` and `/api` | SEO sitemap/robots, plus SSR-ish `seoMiddleware` for marketing routes |
| `publicRoutes` | `/api/public` | **unauthenticated**: health check, web form submission, Meta webhook verify/receive, public FAQs |
| `uploadRoutes` | `/api/upload` | call recording / file uploads (multer) |

Special middleware notes:
- `/api/meta/callback` and `/api/meta/webhook` get raw-body parsing (for Meta signature verification) mounted **before** `express.json()`.
- A catch-all `app.get('*', seoMiddleware, ...)` serves the built React SPA (`../client/dist`) for non-`/api` paths — this backend is deployed to also serve the frontend's static build.
- `checkSystemLock` (from `superAdminProtection.ts`) is loaded and mounted asynchronously (`import(...).then(...)`) very early — a platform-wide kill switch.

## Auth & multi-tenancy pattern

**JWT flow** (`src/middleware/authMiddleware.ts`, `protect`):
1. Reads `Authorization: Bearer <token>`, verifies with `JWT_SECRET`.
2. Loads the full `User` row from Postgres by `decoded.id` (including `organisation`), strips `password`.
3. Attaches to `req.user` as a plain object plus two computed flags: `isSuperAdmin` (via `roleUtils.isSuperAdmin`) and `isBranchManager` (whether the user manages any `Branch`).
4. Falls back to **API key auth** if no Bearer token: `X-API-KEY` header hashed with SHA-256 and matched against `ApiKey.keyHash`; on success it loads that key's creator `User` as `req.user`. `verifyApiKey` (`apiKeyMiddleware.ts`) is a separate, similar implementation used specifically by `/api/v1/*` — it instead fabricates a synthetic `req.user = { id: 'api-user', organisationId, role: 'api_client' }` rather than loading a real user.
5. `req.user.role` is a **free-form string**, not a TypeScript enum — normalize with `roleUtils.normalizeRole()` before comparing (`"Super Admin"` → `"super_admin"`).
6. `admin` and `authorize(...roles)` middleware gate by role after `protect`.

**Multi-tenancy rule**: scope every tenant-owned query by `organisationId`. There's a `dataIsolation` middleware (`middleware/dataIsolation.ts`) that computes `req.orgFilter = { organisationId: user.organisationId }` and `req.isSuperAdmin`, but **it is opt-in per-route, not applied globally in `index.ts`** — most controllers instead pull `organisationId` off `req.user` directly rather than using `req.orgFilter`. Don't assume it runs.

**`hierarchyUtils.ts`** (`src/utils/hierarchyUtils.ts`) — the recurring RBAC/visibility pattern used across controllers:
- `getOrgId(user)` — safely extracts `organisationId` from `req.user` (handles both flat and included-relation shapes).
- `getSubordinateIds(userId)` — BFS walk of `User.reportsToId` self-relation; returns `[userId, ...allDownstreamReports]`.
- `getVisibleUserIds(userId, subordinatesOnly?)` — the core visibility set: subordinates via reporting chain, **plus** users in teams the caller manages (`Team.managerId`), **plus** (only if the caller's role string contains `admin`/`branch`/`country`/`regional`) users in branches the caller manages. This role-substring check is fragile — a role literally named e.g. `"branch_coordinator"` would get branch-wide visibility even if not intended.
- `getLeadVisibilityFilter(user, isSuperAdmin?)` — returns a Prisma `where` fragment: `{}` (no filter) for `super_admin`/`admin`; otherwise an `OR` of (assigned to a visible user) OR (created by me) OR (created by a visible user AND unassigned), with extra unassigned-lead carve-outs for `admin`/`manager` roles.
- `getOppVisibilityFilter(user, isSuperAdmin?)` — returns `{}` for super_admin/admin, else `{ ownerId: { in: visibleUserIds } }`. **Confirmed correct as of this read — uses `ownerId`, which is the real field on `Opportunity`.** (A prior bug referencing a nonexistent `Opportunity.createdById` has been fixed; `Opportunity` has no `createdById` field at all, only `ownerId`/`previousOwnerId`.)

Typical controller usage pattern:
```ts
const orgId = getOrgId(req.user);
const visibilityFilter = await getOppVisibilityFilter(req.user, req.user.isSuperAdmin);
const opportunities = await prisma.opportunity.findMany({
    where: { organisationId: orgId, isDeleted: false, ...visibilityFilter }
});
```

## Real architectural pattern observed

The project's own docs describe "Controllers route, Services execute business logic, Repositories (Prisma) touch
DB" — **this is aspirational, not what the code does.** In practice:
- Controllers call `prisma` **directly** in the large majority of cases. E.g. `leadController.ts` (81KB, the
  biggest controller) has 54 direct `prisma.*` calls in addition to importing services.
- A `services/` layer does exist and **is** used for specific, genuinely reusable/complex concerns that got
  extracted: lead **distribution/round-robin** (`distributionService.ts`), the **workflow automation engine**
  (`workflowEngine.ts`), **duplicate lead detection** (`duplicateLeadService.ts`), **notifications**
  (`notificationService.ts`), **follow-up/task creation** (`followUpService.ts`, `taskService.ts`),
  **geo-location** (`geoLocationService.ts`), **EMI/payment math** (`emiService.ts`), **reporting aggregation**
  (`reportingService.ts`), **Meta/WhatsApp/Gmail/Stripe integrations**, and the **shuffler** module.
- So the honest model is: **fat controllers that inline most CRUD + validation + response shaping, with
  business logic extracted into services only where it's shared across multiple controllers/crons or
  algorithmically nontrivial** (round-robin assignment, workflow execution, duplicate detection, EMI math).
  Don't expect a repository layer — Prisma calls happen directly in both controllers and services.

## The `shuffler-module` (controllers / services / scripts)

Not obviously named — it is the **lead re-shuffling / redistribution** feature, distinct from `AssignmentRule`
(which handles round-robin assignment of *new* incoming leads). The shuffler periodically **re-assigns existing
leads** among currently active users, driven by a per-organisation `Organisation.shufflerConfig` JSON blob
(`isAutoShufflingOn`, `shuffleTime` "HH:mm", `timeFrameType` — `days_before` / `date_range` / `backwards_from_date`,
`minLeadAgeDays`, `statuses` to shuffle, `selectAllUsers`/`users`/`branches` targeting).
- `services/shuffler-module/shufflerService.ts` — `runShuffler()` (cron entry, checked every minute against
  `shuffleTime`), plus `forceShuffleOrg()` and `getShuffleCountOrg()` for manual/preview use.
- `controllers/shuffler-module/shufflerController.ts` — thin HTTP wrappers: `triggerShuffleNow` (fires
  `forceShuffleOrg` in the background, doesn't await it), `getShuffleStatus`, `getShuffleCount` (dry-run preview).
- `scripts/shuffler-module/test-shuffler.ts` — manual test script.

## Cron / background jobs (`src/services/cronService.ts`)

`initCronJobs()` is called from `index.ts` **only when `!process.env.NODE_APP_INSTANCE || NODE_APP_INSTANCE === '0'`**
— confirmed real: this is the PM2-cluster guard so cron jobs run exactly once across a clustered deployment
instead of once per worker. All cron DB access uses the separate `cronPrisma` client (3-connection cap) via
`config/prisma.ts`, not the main `prisma` client.

Registered jobs (all `node-cron` schedules):
- `*/5 * * * *` — DB keep-alive ping (`SELECT 1`).
- `0 0 * * *` (midnight) — license expiry enforcement, sales target expiration check, EMI overdue status update. (Daily lead "rollover" is explicitly disabled/no-op — logged but does nothing.)
- `0 8 * * *` — daily task reminders.
- `0 * * * *` (hourly) — meeting reminders.
- `*/15 * * * *` — upcoming follow-up notifications.
- `* * * * *` (every minute) — **dynamic per-org daily report dispatch**: matches `Organisation.dailyReportTime` (HH:mm) against current time, then sends WhatsApp (always, if a client is configured) and Email (if `dailyReportEmailEnabled`) admin + manager reports.
- `* * * * *` (every minute) — `WorkflowQueue` processor: pulls up to 50 due (`executeAt <= now`, `status: pending`) items and resumes them via `WorkflowEngine.resumeWorkflow`.
- `0 1 * * *` — retention cleanup: `AuditLog` older than 90 days, `Notification` older than 14 days, batch-deleted 5000 rows at a time with 200ms pacing between batches.
- `0 2 * * *` — trash purge (soft-deleted records older than 7 days) via `TrashService.runAutomatedPurge(7)`.
- `*/30 * * * *` — Meta lead polling fallback (`MetaPollingService.pollAllOrganisations`).
- `0 4 * * *` — daily Meta Marketing API compliance ping.
- `0 3 * * *` — Meta token expiry check (warns admins in-app 7 days before expiry and on actual expiry).
- `* * * * *` (every minute) — the **shuffler** job (`runShuffler()`), which internally self-throttles per org based on `shufflerConfig.shuffleTime`.

Also on server boot (`index.ts`'s `httpServer.listen` callback, not cron): `verifySuperAdminIntegrity()`,
`initializeGlobalRoles()`, an immediate one-off `generateMeetingReminders()` run, and a deferred route-table dump
to console (`logRoutes`).

## Known gotchas / footguns

- **`Opportunity.closeDate` is nullable and client-supplied**, not server-derived. Both `createOpportunity` and
  `updateOpportunity` in `opportunityController.ts` just do `new Date(req.body.closeDate)` if provided, else
  `null`. An "open"/in-progress opportunity may or may not have a `closeDate` depending on what the frontend
  happened to send — don't assume `closeDate` presence implies anything about stage/status, and don't build
  date-range reports that assume all opportunities have one.
- **`analyticsController.ts`'s `getDateFilter`** (used for month-based dashboard filters) does manual IST
  timezone-shift math on UTC month boundaries: it builds a UTC month boundary with `Date.UTC(year, month, 1)`
  then does `.setMinutes(start.getMinutes() - 330)` (330 = 5.5 hours = IST offset) to shift the boundary so it
  represents local-IST midnight. This pattern (`±330 minutes` on a UTC date) recurs elsewhere too (e.g. the
  follow-up "due today IST" calculation a few lines below it, and the shuffler's day-boundary checks are
  IST-naive by contrast — worth double-checking each date computation individually rather than assuming a
  shared convention). If you add new date-range filtering, follow this exact `± 330 minutes` idiom for
  consistency with existing reports, or you'll get off-by-one-day results for IST-based orgs.
- **`getOppVisibilityFilter` bug is fixed** — confirmed it correctly uses `ownerId` (the only owner-ish field
  `Opportunity` actually has). If you see old bug reports about `Opportunity.createdById`, they're stale;
  that field does not exist on the model.
- **Two ESLint configs coexist** (`.eslintrc.js` legacy + `eslint.config.js` flat) and the flat one is a
  stale frontend/Vite config — don't trust `eslint.config.js` for backend conventions.
- **`Lead.status` is a plain `String`, not the `LeadStatus` enum** defined in the schema — the enum exists but
  isn't actually wired to the field. Valid values live in `Organisation.leadStatuses` (custom per-org JSON
  config) instead, not the Prisma enum. Same likely applies to `Opportunity.stage`/`leadStatus` vs
  `Organisation.opportunityLeadStatuses`.
- **`dataIsolation` middleware is not globally applied** — most controllers roll their own `organisationId`
  scoping directly from `req.user.organisationId` rather than relying on `req.orgFilter`. Don't assume every
  route benefits from it.
- **`role` is a free-form string everywhere**, never a TS enum/union at the type level — always run it through
  `roleUtils.normalizeRole()` before comparing, and note `getVisibleUserIds`'s branch-manager check does a raw
  `.includes('admin'|'branch'|'country'|'regional')` substring match on the role string, which is a footgun for
  any custom role name that happens to contain those substrings.
- **Two parallel `express.Router` mounts for `/api/search`** in `index.ts` (`app.use('/api/search', searchRoutes)` appears twice, back to back) — harmless (idempotent) but clearly a copy-paste leftover, not intentional.
- **Prisma workflow is `db push`, not migrations** — there's no `prisma/migrations/` history; schema changes are pushed directly. Be cautious suggesting `prisma migrate` commands; they don't match this project's actual workflow.
- Rate limits in `middleware/rateLimiter.ts` are set extremely high (100,000 req/15min general, 10,000 auth attempts/15min) — effectively disabled in practice, don't rely on them for real abuse protection.
- `EMISchedule` and `Opportunity.paymentStatus`/`paymentDate` are two independent, only loosely-related payment-tracking mechanisms on the same `Opportunity` — check which one a given feature actually reads/writes before assuming they're kept in sync automatically.

## Noise to ignore (root of `Dad-backend/`)

These are debug/scratch artifacts from past sessions, not part of the app. Do not read them for context, do not
treat their presence as meaningful, and do not "clean them up" unless explicitly asked:
- `all_lint_issues.txt`, `final_fixed_lint.txt`, `final_lint_output.txt`, `fresh_lint_output.txt`,
  `full_lint_output.txt`, `lint_results_client.txt`, `lint_results_server.txt` — stale captured lint output.
- `debug_crash.log` — a ~700KB crash log dump.
- `dist.tar.gz`, `dist.zip`, `dist_update.zip` — large (~30MB each) stale build artifact archives.
- `check-leads.js`, `fetch-leads.js`, `test-calls.js`, `test-check-dup.js`, `test-jaseera.js`,
  `test-jaseera2.js`, `test-jaseera3.js`, `test-rules.js` — ad-hoc root-level debug scripts (note: separate
  from the more organized `src/scripts/` collection).
- `fix-service-casing.sh`, `fix-service-casing-v2.sh`, `copy-ssh-key-for-github.sh`, `test-share-link.sh` — one-off shell scripts from past fixes/deploys.
- `scratch/` (root) and `src/scratch/` — explicitly named scratch dirs full of one-off `check_*`/`test_*` scripts.
- `dist/` — build output (regenerated by `npm run build`; don't hand-edit).
- `uploads/` — runtime file storage (call recordings, uploaded docs); not source.

## Where NOT to look / dead ends

- `src/scripts/` (the ~90-file collection) is overwhelmingly **historical debugging scripts for one specific
  incident class** — Meta Ads/lead-sync investigations (`check_meta_*`, `check_campaign_*`, `check_ads_*`,
  `check_forms_*`, `sync_*`, `delete_*_meta_leads.ts`, etc., many dated late July 2026). Treat these as forensic
  artifacts of past incidents, not as documentation of current expected behavior or reusable utilities.
- `LeadStatus` enum in `schema.prisma` — defined but not actually bound to `Lead.status` (see gotchas). Don't
  spend time reconciling the enum values against product requirements; the real source of truth is
  `Organisation.leadStatuses` (Json).
- `eslint.config.js` at the root — a stale frontend config, not representative of backend lint rules (use
  `.eslintrc.js` instead).
- `pnpm-lock.yaml`/`pnpm-workspace.yaml` alongside `package-lock.json` — the presence of both suggests a
  package-manager migration that may be incomplete; don't assume pnpm workspaces are actually in active use
  without checking with the user first.
