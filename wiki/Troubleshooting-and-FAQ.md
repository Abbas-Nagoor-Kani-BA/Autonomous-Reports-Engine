# Troubleshooting and FAQ

## Pull fails immediately with "no tab" / session error

The extension relays requests through an **open, logged-in ServiceNow tab**. If
no tab matching the instance origin is open, the pull fails fast.

- Open your instance in a browser tab and log in.
- **Refresh that tab after loading or reloading the extension** — the content
  script must be present. See [Authentication Chain](Authentication-Chain).

## 401 Unauthorized on API calls

ServiceNow rejects session-authenticated calls that are missing the
`X-UserToken` (the `g_ck` CSRF token). Refreshing the ServiceNow tab usually
fixes this, because the token lives as a page-context JS variable that the
extension reads on a fresh page. See [Authentication Chain](Authentication-Chain).

## The extension won't load / "manifest" or ".ts" errors

Load the **unzipped release folder**, not the source. Download the extension zip
from [Releases](https://github.com/Abbas-Nagoor-Kani-BA/Autonomous-Reports-Engine/releases),
unzip it, and **Load unpacked** the unzipped folder. Chrome cannot execute the
repository's `.ts` sources, so loading the repo root (or a source checkout) will
not work. Developers building from source load the **built** folder (`dist/` or
`dev/`). See [Installation](Installation).

## A filter set was skipped

If a filter matches more tickets than **Max tickets per filter set**, the set is
skipped with a warning. Narrow the filter or raise the limit in
[Configuration](Configuration).

## Some tickets have no timeline data

Audit availability depends on the instance's retention and your roles. Tickets
missing audit rows are reported in the done-message count; the viewer shows a
warning banner when tickets that clearly have history return no events.

## Suspend/resume are empty for SCTASK

`sc_task` has no out-of-the-box "On Hold" state, so suspend/resume stay null
unless that label exists in the table's choice list. See
[Timeline and SLA Rules](Timeline-and-SLA-Rules) and [Roadmap](Roadmap).

## Times look off by an hour

All displayed times follow the **instance clock**, not your browser. Rows
spanning a DST change resolve their own offset. See
[Timezone Contract](Timezone-Contract).

## A pull returned old data / I want fresh data

Query results are reused for the **Query cache TTL** window (default 15 min);
timelines are reused until the ticket changes (max 7 days). Use **Clear pull
cache** in [Configuration](Configuration), or set the TTL to `0` to always hit
the API. See [Caching](Caching).

## Excel shows a repair dialog on the exported file

This is a template integrity issue handled in
[Export Internals](Export-Internals) (stripping `xl/calcChain.xml` and setting
`fullCalcOnLoad`). If you hit it, report the template you used.

---
Related: [Authentication Chain](Authentication-Chain) · [Caching](Caching) ·
[Timezone Contract](Timezone-Contract)
