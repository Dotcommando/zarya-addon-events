# ADR 0004: Short Events identity

Date: 2026-10-31

Status: Accepted through the owner's request to complete the rename.

Use `events` for the add-on connection, administration component and producer,
and `addon.events.session.*` for its hook definitions and source operations.
Release this change as package/implementation 0.4.0. This supersedes the retained
connection and hook names in ADR 0002 and ADR 0003.

An existing installation migrates connections and subscriptions together, retaining
their identities, settings, enablement and handler order. Move registration metadata
to the new keys and invalidate captured registry versions. Fail on conflicting new
identities rather than merge them. Preserve schema receipts and the identity secret.
The site switches to a newly built immutable runtime artifact while offline.

Historical events, delivery snapshots, business IDs, request APIs, collections and
applied schema manifests retain their exact meaning and bytes. `participation` in
booking-domain contracts still describes a request to participate, not the add-on's
technical identity. No business records are recreated or removed by this rename.
