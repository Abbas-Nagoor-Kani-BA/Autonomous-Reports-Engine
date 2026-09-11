# Why Time Conversions

Every ticket carries several timestamps — opened, resolved, assigned, and so on.
As those times move from ServiceNow to your screen and into the exported
workbook, the tool converts them between a few different formats. This page
explains, in plain terms, why so many conversions happen and what each one is
for.

## The one-sentence idea

ServiceNow stores every time in **UTC**, but you want to see each time on your
**instance's own clock** — so almost everything about time handling is just
bridging those two.

## The journey of a single timestamp

Follow one ticket's "opened" time on an instance that runs at UTC+1:

1. **In ServiceNow** the record holds two views of the same moment: the raw UTC
   value `2026-08-01 10:00:00` and the display value `2026-08-01 11:00:00`
   (one hour ahead, because the instance is UTC+1).
2. **During the pull** the tool fetches both together and keeps both — the raw
   UTC as the source of truth, the display value as the instance-clock
   reference.
3. **In storage** the ticket carries both sides, so nothing has to guess the
   instance clock later.
4. **On screen** the tool shows the instance-clock time (`11:00:00`), the same
   time you would see inside ServiceNow.
5. **In the export** the workbook gets the same instance-clock time, so the
   report matches what everyone expects.

At each hop a conversion happens for a concrete reason, described next.

## Why so many formats

Each format earns its place; skipping it would break something:

- **Raw UTC** (for example `2026-08-01 10:00:00`) — *because* it is unambiguous
  and safe to compare and subtract. Without a single common baseline, two times
  from different seasons or sources could not be compared reliably.
- **Instance display value** (for example `2026-08-01 11:00:00`) — *because* it
  is the time a user actually recognizes. Without it, the tool would have no
  trustworthy reference for what the instance clock is.
- **Epoch milliseconds** (a plain number) — *because* durations and SLA math are
  subtraction, and numbers subtract cleanly while formatted strings do not.
  Without it, "assigned to acknowledged" could not be measured accurately.
- **ISO with a `Z` suffix** (for example `2026-08-01T10:00:00Z`) — *because* the
  `Z` says "this is UTC" out loud, so parsing can never accidentally read a time
  in the wrong zone.

So the conversions are not busywork: each turns a time into the form the next
step needs.

## Why we never use the browser's clock

Two people can open the same pull from different countries. If the tool used the
browser's clock, they would each see a different time for the same ticket. To
keep everyone on the same page, the tool ignores the browser entirely and always
renders on the ServiceNow instance clock.

## Why the offset comes from the ticket itself

Because a dataset can span a daylight-saving change (a winter ticket and a
summer ticket can sit on different offsets), the tool reads each ticket's own
raw-vs-display gap to learn that ticket's exact offset, rather than applying one
fixed number to everything.

## If a time looks wrong

- **Every time is off by the same number of hours.** This usually points to a
  timezone offset problem rather than bad data. See
  [Troubleshooting and FAQ](Troubleshooting-and-FAQ).
- **Timelines look empty for tickets that clearly have history.** This usually
  means the activity feed returned nothing for those tickets, not a time bug;
  the viewer shows a warning banner. See
  [Troubleshooting and FAQ](Troubleshooting-and-FAQ).

## Want the technical version?

- [Timezone Contract](Timezone-Contract) — the developer-facing rules and the
  `fmtInstant` coupling.
- [Timeline and SLA Rules](Timeline-and-SLA-Rules) — how the derived times are
  computed.
- `docs/time-handling.md` in the repository — the full deep dive with worked
  examples.

---
Related: [Data Viewer](Data-Viewer) · [Calclens](Calclens) ·
[Timezone Contract](Timezone-Contract) · [Troubleshooting and FAQ](Troubleshooting-and-FAQ)
