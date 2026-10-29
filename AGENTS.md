# Zarya Events Add-on Instructions

This repository owns the optional event scheduling and participation capability
for CMS Zarya. Follow the same architecture, strict typing, formatting, dependency
pinning and verification principles as CMS Zarya. The add-on is a library installed
in the shared backend, not another application or independent service.

## Architecture and ownership

Use layer-first src/domain, src/app/use-cases, src/app/services, src/ports/inbound,
src/ports/outbound, src/adapters/inbound, src/adapters/outbound and src/infra.
Dependencies point inward: ports -> domain; app -> ports/domain; adapters ->
ports/domain. Infrastructure owns composition. Domain, app and ports contain no
NestJS, Mongoose, HTTP DTOs or SDK types. Persistence sessions stay in adapters.
Use explicit inbound interfaces; use-case names end in UseCase and filenames in
.use-case.ts. Shared application services need an actual reusable responsibility.
Do not add empty trees, speculative helpers or forwarding workflow wrappers.

Never import CMS or another repository's src, use sibling runtime paths/symlinks,
or read another capability's collections. Use the versioned @zarya/addon-contracts
package and explicit ports. Technical transaction-fence contracts belong only to
persistence adapters. CMS composition supplies real adapters for page/publication,
access and the site's add-on lifecycle. Tests supply deterministic fake ports.

Pages own game content and URLs. Sessions reference same-site pageId; requests
reference stable sessionId. There is no Game entity, required template or URL
prefix. All business documents, queries, caches and jobs are scoped by siteId.
Public access requires an Enabled connection and an eligible activated published
page. Disabling retains data and authorized handling of existing records.

## Business invariants

Store instants as UTC and display/evaluate calendars in explicit IANA zones.
Date-only values remain calendar dates. The CMS supplies the site time zone for
display and local input. New administration schedules use fixed UTC recurrence;
changing the CMS zone never shifts stored meetings or rewrites recurring rules.
Explicit schedule edits apply the existing series scope. Duration is elapsed minutes. Generate a bounded rolling one-year horizon, not an infinite series.
Preserve occurrence identities/exceptions across regeneration and scoped edits.

Reserve all requested places atomically or none. Pending requests hold places
until manual decision; confirmation converts holds, decline releases them.
Idempotency and occupancy changes commit together. New writes atomically enforce
the captured site connection against concurrent disable/configuration. No implicit
notifications, payment prerequisites, expiry, attendee transfer or write retries.
Removing an event with requests cancels it and retains requests/occupancy. Removing
an empty recurring occurrence retains a regeneration exclusion. Add-on uninstall
and destructive business-data purge are deferred.

## Code, tooling and source

Use npm, strict TypeScript, precise types and I-prefixed object interfaces. Closed
sets use enums. Use structured parsers where practical. Preserve comments and avoid
unrelated refactoring. Never use destructive Git commands without an owner request.

Pin every direct dependency/devDependency/peerDependency to an exact version;
commit package-lock.json and use npm ci. Pin Node/npm and Docker images explicitly.
Local distribution artifacts use versioned tarballs and verified lockfile integrity;
never floating references. Upgrade dependencies deliberately with compatibility
verification. No credentials, environment files or private evidence in Git/artifacts.

The root eslint.config.mjs is copied from CMS Zarya and governs JS, TS and Svelte.
Preserve its rule options. Do not add another TypeScript formatter or nested configs.
Run npm run format, resolve remaining diagnostics manually, then npm run lint.
Multiline object literals have one property per line with a trailing comma.

Administration sources belong in admin/src; they are shipped as Svelte components
for the host's Svelte/Vite build. Public chunks, browser TS and data-only Snippet
sources belong in public/. Browser bundles must contain no server imports/secrets.
The host renderer owns production compilation/minification/CSS extraction.
Use flat shortened BEM, px/%/vh/vw lengths (fr only for grid), mobile first from
320px, shared layout breakpoints 576/768/992/1200px and a 1440px desktop cap.
Support keyboard/focus, zoom and reduced motion; reserve asynchronous widget space.
Fixed regions above scroll panes show a shadow only while that pane is scrolled.
Selectable rows have backgrounds and a visible selected border without layout shift.

## Workflow and verification

Read relevant contracts/ADRs before changes. Agree material business behavior and
input/output/failures before implementation; resolve routine implementation choices
from existing contracts. Work in reviewable increments without plan/status files.
Implement one observable use case at a time: failing fake-port unit test, application
behavior, inbound composition, failing adapter test, real adapter and focused
integration coverage. Do not claim unexecuted Red/Green or database guarantees.

Run only explicitly selected affected tests, not the entire suite unless requested.
Keep relevant architecture, typecheck, lint and build checks. Integration tests use
isolated dependencies and known synthetic databases; never reset unrelated data.
Normally execute relevant integration coverage at each five-use-case boundary;
concrete regressions or explicit owner requests justify earlier runs. Bug fixes need
observable regressions. Verify site isolation, publication, authorization, lifecycle,
concurrency, retained requests, idempotency and recurrence exceptions when affected.

Mongoose schemas have explicit plural snake_case collections and camelCase fields.
Map _id/BSON at persistence boundaries. Validate filters/updates explicitly. Use
checksum-verified migrations for validators/indexes; disable automatic schema/index
creation. Transactions need a replica set. No unfinished methods or fake production
storage. Do not start/restart a persistent application server; temporary isolated
test servers must close. The owner starts CMS from the IDE.

Record deliberate architecture decisions in docs/adr and contracts in docs/arch.
Report actual changes, commands, outcomes and limitations factually.
