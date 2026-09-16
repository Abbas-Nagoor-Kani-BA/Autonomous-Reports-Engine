# Timeline scenarios: assignTime and acknTime

Business requirements — never change semantics without asking.

This document details every scenario `core/phase2.ts` handles when deriving
**assignTime** and **acknTime** for a ticket. It is the companion to
[`timeline.md`](timeline.md), which states the four rules at a glance; this file
enumerates the exact inputs and outputs so the behaviour is unambiguous.

## Terms

- **Our queues** — every queue configured in Settings. In code this is the set
  `Object.keys(membersByQueue)`, threaded into `extractTimelines` as
  `ExtractCtx.queueNames`. Matching is name-keyed (trimmed, lowercased).
- **Our members** — the flat team-member list from Settings, applied to every
  queue. In code this is the union of `fallbackMembers` and the per-queue member
  lists, passed as `ExtractCtx.memberNames`.
- **Stay** — a continuous interval during which the ticket's `assignment_group`
  is one of our queues. A ticket can have several stays (it enters a queue,
  leaves, and re-enters, or moves between two of our queues). Each stay records
  its entry epoch, its exit epoch (null while still open), the queue it belongs
  to, and every member acknowledgement seen inside it.
- **Ack (acknowledgement)** — an `assigned_to` change whose new value is one of
  our members, occurring at or after the entry of the stay it falls in.

## Core principle: measure against ANY of our queues

A ticket is **not** measured only against its current assignment group. It is
measured against **all** of our configured queues. This matters because a ticket
can be assigned to and acknowledged in one of our queues, then travel to a
different one of our queues (or to a queue that is not ours) before it is pulled.
The current group at pull time is often not the queue where the real work and
acknowledgement happened.

## Selection rule: acked-stay-wins

To choose assignTime and acknTime, `resolveAssignAndAckTime` walks the stays
from newest to oldest and applies this precedence:

1. **An acknowledged stay wins.** The **latest** stay that contains a valid
   member ack sets BOTH:
   - `assignTime` = that stay's entry epoch, and
   - `acknTime` = the first valid ack inside that stay.

   This holds **even if a later, un-acknowledged our-queue stay exists** — so
   assignTime can "go back" to an earlier entry. An acked stay always beats a
   later un-acked our-queue stay.

2. **No stay was ever acknowledged, but the ticket did enter one of our
   queues.** `assignTime` = the entry epoch of the **latest** our-queue stay;
   `acknTime` = null. (A queue entry is guaranteed for any pulled ticket, so
   assignTime is present; the ack simply never happened.)

3. **The ticket never entered any of our queues.** `assignTime` = null and
   `acknTime` = null.

After selection, `assignTime` is CLAMPED to never precede `opened_at`. The clamp
adjusts only the displayed assignTime; it does not change which ack was selected.

## Scenario catalogue

The following table uses these fixtures:

- Our queues: **QA**, **INFORM**
- Not our queues: **ETL**, **OTHER**
- Our members: **Alice**, **Bob**
- Non-member: **Zoe**
- Ticket opened at **08:00**

| # | Event sequence (group / assigned_to) | Current group at pull | assignTime | acknTime | Why |
|---|---|---|---|---|---|
| S1 | OTHER→QA @09:00, →Alice @09:05, QA→ETL @10:00, ETL→QA @11:00, →Bob @11:20, QA→INFORM @15:00 | INFORM | **11:00** | **11:20** | Latest acked stay is the second QA stay (entry 11:00, ack 11:20). The later INFORM stay has no ack, so assignTime goes back to the acked QA stay. |
| S2 | OTHER→QA @09:00, QA→INFORM @12:00, →Alice @12:30 | INFORM | **12:00** | **12:30** | The ack is in the latest stay (INFORM). |
| S3 | OTHER→QA @09:00, →Alice @09:10, QA→INFORM @14:00 | INFORM | **09:00** | **09:10** | The QA stay is acked; the later INFORM stay is not. Acked-stay-wins: assignTime goes back to the QA entry. |
| S4 | OTHER→QA @09:00, →Zoe @09:10, QA→INFORM @14:00 | INFORM | **14:00** | **null** | Zoe is not our member, so no stay is acked. Fallback: assignTime is the latest our-queue entry (INFORM @14:00), ack null. |
| S5 | OTHER→ETL @09:00, →Zoe @09:10 | ETL | **null** | **null** | The ticket never entered one of our queues. |
| S6 | (no group events) opened @08:00, current group QA, →Alice @08:30 | QA | **08:00** | **08:30** | Born-in-queue fallback: with no group-change events but the current group is ours, the stay opens at opened_at. Alice's ack counts. |
| S7 | OTHER→QA @09:00, →Alice @09:00 (same timestamp) | QA | **09:00** | **09:00** | assignTime and acknTime are allowed to be equal. The entry and the ack share the epoch; a deterministic tie-break processes the group entry before the same-epoch assignment so the ack lands inside the open stay. |

### Real-world example (basis for S1/S3)

A British Airways ticket that travels APPSUP_AIRPORTOPS → APPSUP_ETL →
APPSUP_AIRPORTOPS → APPSUP_INFORM, with our member Sethupathi Rammohan assigned
twice (once in each AIRPORTOPS stay) and both APPSUP_AIRPORTOPS and APPSUP_INFORM
configured as our queues:

- Current group at pull: **APPSUP_INFORM** (no ack there).
- Latest acked our-queue stay: the second **APPSUP_AIRPORTOPS** stay.
- Result: **assignTime = the AIRPORTOPS re-entry**, **acknTime = Sethupathi's
  assignment in that stay**.

Before multi-queue support, this ticket produced assignTime from INFORM and a
**null** ack, because only the current group was considered. Multi-queue
selection recovers the real assign/ack pair.

## Edge cases and tie-breaks

- **Equal assign and ack timestamps (S7).** When a queue-entry event and a
  member-assignment event share the same timestamp, events are ordered
  `assignment_group` → `assigned_to` → `state` at equal epochs. This guarantees
  the stay is open before the same-epoch ack is processed, so the ack is
  recorded and `assignTime == acknTime` (a zero-length assign→ack interval).
- **Pre-queue assignment.** An `assigned_to` to one of our members that occurs
  strictly before the ticket enters the stay does not count (an ack must be at
  or after its stay's entry).
- **Non-member assignment.** An `assigned_to` to someone not in our member list
  never produces an ack.
- **Queue-to-queue moves between two of our queues.** Moving directly from one
  of our queues to another closes the first stay and opens a second; each stay
  is evaluated independently for acks.

## Suspend and resume interaction

Suspend/resume follow the **chosen stay's queue** (see `resolveSuspendResume`):

- Only "On Hold" transitions that occurred while the ticket was in the **same
  queue** as the chosen stay count, and only at or after assignTime. Holds in a
  different one of our queues are excluded so a hold from a queue we did not
  select cannot leak into the result.
- Within that queue, suspendTime is the first qualifying "On Hold" and resumeTime
  is taken from the last resolved hold (`In Progress`, else `Resolved`).
- `enforceOrderingContract` then drops a suspend that is at/before assignTime and
  a resume that is at/before suspend, preserving
  `resumeTime > suspendTime > acknTime >= assignTime`.

## Where this lives in code

- `ExtractCtx.queueNames` — the set of our queues (from `analyzeAll`).
- `handleGroupEvent` — opens/closes stays for any of our queues.
- `handleAssignmentEvent` — records member acks into the open stay.
- `resolveAssignAndAckTime` — the acked-stay-wins selection above; returns the
  chosen stay.
- `resolveSuspendResume` — bounds holds to the chosen stay's queue.

Regression coverage for every scenario in this document (S1–S7 plus the BA
ticket) lives in `tools/phase2-unit-test.js`.
