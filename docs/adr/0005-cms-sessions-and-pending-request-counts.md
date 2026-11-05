# ADR 0005 Events CMS query and calendar pending request counts

Date: 2026-11-04

Status: Accepted through the owner's Events and BloomUpcoming update request.

## Decision

Events 0.4.2 exposes sessions.list through the existing version-1 CMS extension
descriptor. The adapter invokes ListBookableSessions with host-owned siteId.
Inputs are pageId, ISO rangeStart/rangeEnd, optional cursor, limit and filter
(time, status, availability). Existing cursor paging and query validation remain
unchanged: default limit 20, allowed 1..100. Results are {items, nextCursor};
instants are ISO strings. No contacts or administrative counters are exposed.
The operation is Query/PublicEnabled. Existing page-publication, site ownership,
disabled-connection and failure semantics remain with the owning use case.

The administrative session list adds pendingRequestCount to each item, using a
separate batch query for its selected session identities. This counts Pending
request documents, independently of places. Confirmed/Declined requests and
foreign-site records are excluded. No request/contact list is loaded for a count.
The existing request index beginning siteId/sessionId/state supports the read;
no schema, migration or index changes are required.

The calendar sums these counts by the event start's date in the selected CMS site
time zone. Retained Pending requests on cancelled events still need a decision.
Zero has no badge. Positive counts use dark amber #925400 over a pale amber
surface mixed with the host's --cms-surface. The accessible day label names both
event count and pending request count. Missing/invalid count data is an error,
not an inferred zero. Counts are informational reads after the session page;
they are not an atomic occupancy snapshot.

## Packaging and verification

The CMS remains generic. The site installation binds the package's business
operations and CMS descriptor in its technical runtime composition. Package
artifacts and lockfile integrity remain fixed; the minimum CMS version is 0.9.2.
Unit tests cover JSON translation, rejected identities/input, query failures,
Pending aggregation, protected list access and the calendar data boundary.
The consuming site verifies installed-runtime/worker/publication integration in
an isolated database and renders the packaged calendar with synthetic data.
