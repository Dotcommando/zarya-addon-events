# ADR 0006: Public session batches with per-page pagination

Date: 2026-11-09

Status: Accepted through the owner's Events batch-query implementation request.

Events 0.4.3 adds `cms.extensions.events.sessions.listForPages`. Inputs are pageIds,
ISO rangeStart/rangeEnd, optional limitPerPage, page-keyed cursors and the existing
time/status/availability filter. Results are `{pages: [{pageId, items, nextCursor}]}`,
including empty page groups, in input order. The old sessions.list contract stays
available. Public session fields and ISO instant encoding are unchanged.

The application operation validates the batch, authorizes PublicEnabled once,
captures one UTC `at` value and checks every requested page through a batch
publication port. Missing/unpublished pages fail the entire operation; foreign
or malformed outbound data fails explicitly. There is no partial success or
silent filtering of inaccessible pages. Duplicate identities and cursor keys
outside the requested set reject. Empty input still requires enabled access.

Each page retains its own 1..100 session limit (default 20), ordering and cursor
scope. A batch admits at most 64 distinct pages. This bounds fan-out and result
memory separately from per-page pagination and the host's encoded bridge limits.
Larger callers split work into explicit batches; no results are silently cut off.

The Events application depends on narrow Events-owned public-page and session
batch-read ports. The host integration adapts the CMS's generic published-page
capability; Events never reads CMS collections or imports CMS source. The
Mongoose adapter alone owns the aggregation pipeline. Each page branch retains
the existing site/page/range/filter/cursor match, stable sort and limit-plus-one.
One aggregate command combines those bounded branches; no global result limit
can starve later pages. Existing cursor encoding remains compatible with list.

The read does not promise an atomic occupancy snapshot. Participation commands
continue to recheck current access, occupancy, idempotency and transaction fences.
Schemas, migration checksums, hook identities and installation secrets do not
change. Package/implementation version is 0.4.3, SDK peer remains 0.4.0, minimum
CMS becomes 0.11.0 for the narrow published-page host capability.

Tests cover fake-port sequencing/failures, JSON translation, all per-page limits,
cursor scope, foreign sites, deterministic ordering and MongoDB parity with
independent list calls. The installation separately verifies the fixed runtime
artifact, restart/disable/publication behavior and before/after rendering.
