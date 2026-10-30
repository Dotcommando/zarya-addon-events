# ADR 0003: CMS hook source bridge

Date: 2026-10-29

Status: Accepted as part of the owner's CMS hooks implementation request.

The add-on uses SDK 0.3.0 to declare its own site hooks for session creation,
cancellation, page changes and removal. Each mutation prepares its corresponding
check before persistence and records its event through the host bridge inside
the same fenced transaction. Failed concurrency checks must occur before event
recording and commit. Disabling the site connection retains its existing data.

Definitions use the existing participation add-on key, independently of the
package's Events product name. User handlers may subscribe to these definitions.
No arbitrary reaction to another CMS capability is installed by default. The SDK
also permits code-owned handlers to consume supported CMS hooks through bounded
pure source, scoped queries and explicitly granted commands.

Fresh installations need the add-on's complete owned schema. Migration 0000-events
now owns session_series, sessions, participation_requests and participation_operations;
0001-session-exclusions retains its existing responsibility. These definitions
were transferred from the existing installation's compiled schema catalogue;
no business data was copied. The clean CMS baseline does not own these collections.

Install from fixed-version artifacts and lockfile integrity. The site owns the
host composition and transactional bridge; neither project imports sibling source
at runtime.
