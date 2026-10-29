# Participation capability contracts

This package owns recurring series, concrete sessions, participant requests and
operation receipts. CMS pages own descriptions, media and URLs. pageId/sessionId
are stable relationships; there is no Game entity, required page type or URL prefix.

All data is scoped by trusted siteId. The host's add-on operation policy is a
required application dependency. Public queries/new requests and standalone
session/series creation require Enabled. Authorized reads, decisions, cancellation,
rescheduling and page replacement can handle retained records while Disabled.
Process settings, a visible menu or caller-supplied identities do not grant access.

## Calendar and event lifecycle

A weekly pattern contains startsOn, nullable endsOn, everyWeeks, ISO weekdays,
localTime, IANA timeZone and elapsed durationMinutes. Evaluate in that zone and
store UTC instants. DST gaps shift forward; overlaps select the later instant.
One-off sessions need no series. Several independent series may use one page.

CreateSessionSeries atomically stores the series and its bounded one-year horizon.
ChangeSessionSchedule explicitly selects Occurrence, Following or Series. Preserve
started/past sessions, stable IDs, individual exceptions and occupied places.
Capacity cannot drop below occupancy. Same-count future occurrences are paired
in recurrence order. Extra occurrences get new IDs; removed ones are cancelled.

GetSessionSeries returns an authorized same-site series. RescheduleSession changes
one future session's actual start/end, zone and capacity using its captured
version; series occurrences retain an individual exception. Moving started events
or moving a future event into the past fails. It never changes requests/occupancy.

RemoveSession cancels a meeting if any requests exist, including declined or
confirmed requests. All requests/counters remain. Without requests, removal
atomically rechecks absence and the session version before deleting the session.
Recurring removals retain a private cancelled scheduling snapshot in
session_exclusions. The generator and scoped series editing use these records
to preserve occurrence identity/pairing without showing or resurrecting them.
One-off removal needs no exclusion. A concurrent reservation causes a conflict,
not an orphan request or partial deletion. Add-on uninstall/data purge is deferred.

The rolling horizon service extends due enabled series weekly and on process
startup. Disabled connections are skipped. Catch-up does not generate missed
historical sessions. Guarded commits preserve edits and occurrence exceptions.

## Requests and decisions

RequestParticipation requires a future Scheduled session, active-published owned
page and a positive whole-group quantity that fits. Name, phone and email are
required and normalized. Hold all places atomically or none, until a manual
organizer decision. There is no implicit expiry, payment or notification.

ConfirmParticipation moves held places to confirmed places without consuming
additional capacity; DeclineParticipation releases the entire hold. Historical
decisions are allowed. Cancelled meetings allow decline, not new confirmation.
Terminal decisions are immutable except replay of the same command identity.
Private request lists show the contact person/group quantity, not a named roster.

Operation keys are scoped by site/operation/actor and canonical input is protected
by a persistent HMAC key. Store only digests and immutable receipts; matching
retries replay original results. Different semantic input conflicts. Public access
is checked before receipt replay, so disabled sites cannot bypass the access gate.

## Persistence and host boundary

Every real write is supplied a captured connection permit and a host-owned
technical transaction fence. Request/decision state, occupancy, receipt and the
connection guard commit in one transaction. If Disable wins first, an older
public permit cannot allocate places. Compare both request/session versions for
decisions; stale writes and uncertain outcomes never trigger a new operation key.
MongoDB requires transactions; application ports expose no sessions/ODM types.

The host REST adapters validate authentication, trusted site and protocol input,
then call these inbound interfaces. The Svelte host supplies a typed site-scoped
request function and page summaries. Browser code does not access persistence or
server services. The data Snippet sees only frozen public summaries; public form
JS calls live sessions/participation endpoints and preserves contacts/retry keys.

Verification uses deterministic fake ports, technical adapter doubles, an inward
import audit and the host's isolated MongoDB/browser integration tests. No tests
send notifications or invoke paid services. The owner starts the application from
the IDE; test servers close after verification.

## Events administration (ADR 0002)

The package exposes EventsAdmin through ./admin. The host contract is version
0.2.0. ListSessionSeries returns all authorized same-site series in identity order,
including ended/retained series; it has no calendar horizon or silent truncation.
The host REST GET /api/admin/sites/:siteId/session-series uses the current session
actor and rejects query parameters. Domain/application code stays in this package;
NestJS and REST composition stay with the site installation.

The UI's schedule input is converted to UTC once. Display is always in the CMS
site zone, and changing that setting does not touch series, sessions or bookings.
The historical zone fields remain compatibility metadata; no event-zone editor is
exposed. Calendar/day/occurrence/schedule/settings use validated query state under
the registered add-on route. Requests are paged explicitly, and calendar event
pages are fully consumed before showing a complete grid. Old data and uncertain
mutations are never silently retried or replaced with empty success screens.
