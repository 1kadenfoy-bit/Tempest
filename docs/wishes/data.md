# Kaden's rules: Data

How Kaden wants this section to behave and look, in his words where possible.
The Data chat keeps this list up to date (`docs/sections/README.md`). One rule per
line, numbered, with the date. When he changes his mind, the rule is edited and
the old wording moves to "Changed".

## Asking the servers

1. Be polite to the weather and safety servers (their free limits are shared by the app, the tests and every chat), but never at the cost of speed: the app stays as fast as it is. Most data changes at known times (a model's new run every few hours, radar every 6 minutes, avalanche bulletins once a day), so the app asks again only when something new could be there, and uses what it already has in between. A check before every merge makes sure it stays that way. (Nov 27, 2026)

3. When the forecast service briefly refuses (busy), a dropped pin reads only the quick part from the map files (the next 48 hours of rain and snow amounts) and waits for the service for the rest (the air profile, the days after 48 h), instead of reading thousands of map-file pieces hour by hour; if the service stays down, the app says so. Reading everything from the map files is kept for long outages (the daily limit). (Nov 28, 2026)

## Recorded weather

2. A recorded day that covers every browser test may be up to about 120 MB on disk (about 75 MB in git); a bigger one stops the recording before anything is kept. Re-recording is rare, so the project growing by that much each time is accepted. (Nov 28, 2026)

## Changed

_Nothing yet._
