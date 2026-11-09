# Events exchange limits

| Exchange | Unit | Limit / behavior |
| --- | --- | --- |
| sessions.listForPages | Distinct page identities per invocation | 0..64; duplicates reject; callers split larger lists |
| Each page in sessions.listForPages | Returned sessions | Default 20, allowed 1..100; separate items and nextCursor for every page |
| Each page cursor | Encoded cursor characters | At most 2048, bound to the existing site/page/range/filter scope |
| Batch persistence read | Elapsed milliseconds | 10000 maximum; failure propagates without partial groups |

The CMS bridge separately bounds incoming/outgoing encoded messages. These
counts do not change those byte budgets, public document GET query handling,
the single-page REST contract or public session fields.
