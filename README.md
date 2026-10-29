# Zarya Participation

Optional recurring events and participation requests for CMS Zarya. This is a
library installed as @zarya/events@0.2.0 in the shared backend and admin
build, not a separate application. Game content remains ordinary CMS pages.

The source follows layer-first Hexagonal Architecture. Host services are explicit
ports; @zarya/addon-contracts@0.2.0 is the only inward external contract. No source
imports or runtime symlinks point into a CMS checkout.

## Development

Node 26.7.0 and npm 11.19.0 are pinned. All library/tooling versions are exact.
The unpublished contract SDK is included as the versioned tarball
vendor/zarya-addon-contracts-0.2.0.tgz, with integrity in package-lock.json.

```sh
npm ci
npm run format
npm run lint
npm run typecheck
npm run build
npm test -- test/architecture.spec.ts test/app/participation/addon-lifecycle.spec.ts
```

Select additional affected test files explicitly. Do not run the entire suite
without the owner's request. The root ESLint policy is copied unchanged from CMS
Zarya. Svelte sources are in admin/src; public chunks, browser TypeScript and the
read-only data Snippet are in public/. The host owns their production build.

## Distribution and integration

```sh
npm run build
npm pack
```

Install the resulting versioned tarball in CMS Zarya and commit the CMS dependency
artifact/lockfile. Updating this source alone does not change an installed CMS.
The CMS build never reads this repository at runtime. Future releases must bump
implementation/package versions deliberately and verify SDK compatibility.

CMS composition supplies page ownership/publication lookups, administrator access,
UTC values, the site add-on policy and a real transactional connection fence.
Persistence adapters own their session/request/exclusion data and Mongoose
sessions. Missing dependencies fail explicitly; there is no fake production mode.

The host provides the management section at /admin/sites/:siteId/addons/participation.
Its registered Svelte component supports a date-range agenda, one-off/weekly event
creation, scoped schedule edits, removal and private request decisions. Public
form sources are adopted through the CMS rendering operations. The sample site
installer lives in the host; enabling an add-on never creates sample content.

New migrations are in migrations/ and use the host's checksum-verifying runner
with owner participation. Historical session/request schema migrations remain
in CMS history. See [the capability contracts](docs/arch/participation.md) and
[the extraction decision](docs/adr/0001-participation-package.md).
