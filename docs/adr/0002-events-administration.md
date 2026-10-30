# ADR 0002: Events administration and fixed UTC schedules

Date: 2026-10-28
Status: Accepted by the owner.

The package is renamed @zarya/events (repository zarya-addon-events). Retain the
participation connection key, business IDs, API routes and migration ownership to
preserve existing data. The add-on remains a library installed as a fixed-version
tarball in a site project, not a CMS core dependency or independent application.

Use ordinary Svelte screens under a CMS-rendered Events/События menu entry. Per-site
adminMenuLabels in configuration override English/Russian menu labels. Calendar,
Schedule and Settings share a compact internal navigation bar. The CMS supplies
shared theme classes, palette, site scope, language, navigation, mutation/dirty state
and scroll behavior. Settings is also reachable from the Add-ons catalogue.

The calendar defaults to the current month in the CMS site timeZone, supports
month/year selection, and opens day lists and occurrence editors. Deep links,
reload and Back/Forward preserve month/day context. The Schedule section lists
recurring series independently of their date horizon and supports creation and
whole-future-series changes using existing identity, occupancy and exception rules.

Dates before the current site-local day use the CMS muted row palette. Empty past
dates cannot be selected; dates with events retain access to their history.
Today/future dates and all enabled calendar controls use shared CMS hover feedback.
Previous/next month buttons use arrow icons on either side of Today, with translated
accessible names. Disabled controls retain their disabled state on hover.

Month navigation retains the last successfully loaded calendar, including its
month, time zone and events. A transparent overlay and centered progress indicator
block calendar controls during loading. Only the latest successful response swaps
the complete snapshot. Failures retain the calendar and expose an explicit retry;
the loading indicator respects reduced motion and has an accessible status label.

Time zones are CMS display/input settings, not live scheduling configuration.
Changing site settings never shifts UTC instants or rewrites series. New UI inputs
are converted once to fixed UTC patterns; existing technical timeZone fields are
retained for package/data compatibility and are not user-editable. Schedule edits
are explicit and display existing future occurrence counts and dates before saving.
There is no automatic site-zone-driven rescheduling. This supersedes the old
administration behavior that stored a separately editable zone per event.

Use mobile first from 320px with 576/768/992/1200px breakpoints. Narrow month cells
show dates and event counts; larger cells add timed event titles. All views use
CMS controls and keyboard focus, and retain visible loading/error/disabled states.
