# ADR 0001: Extract participation as an installed add-on

Date: 2026-10-28

Status: Accepted through the owner's request to develop the add-on separately
with the same architectural, formatting and exact-version principles as CMS Zarya.

Keep domain, application, ports, adapters and composition as sibling layers under
src/. Ship the Svelte administration component under admin/src and editable public
form/Snippet sources under public/. Run in the existing host backend, without a
second service, direct source imports, sibling symlinks or a separate Game entity.

Use versioned @zarya/addon-contracts for neutral host contracts. CMS-owned adapters
supply site/page/publication/access capabilities and the transactional connection
fence. The add-on owns sessions, recurrence, requests, receipts and its new schema
migrations. Historical core migration files remain immutable.

Site connections are explicit and unique per add-on/site. Disable closes public
operations while retaining authorized handling of existing data. The owner deferred
add-on removal; events with requests are cancelled, while empty events can be
removed with recurrence exclusions retained. No automatic notifications or expiry.

Distribute fixed-version tarballs with committed lockfile integrity until a package
registry is needed. The host's deployment installs the package and applies/verifies
its owner-scoped migrations before enabling it. No live dynamic package installer
or per-site implementation version selection is introduced.
