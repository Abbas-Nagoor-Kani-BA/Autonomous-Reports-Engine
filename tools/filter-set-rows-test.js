import test from "node:test";
import assert from "node:assert/strict";

const { filterSetToRows, describeFilterSet } = await import("../surfaces/panel/index.ts");

const COND_FIELDS = [
  { key: "assignedTo", label: "Assigned to", field: "assigned_to", type: "ref" },
  { key: "state", label: "State", field: "state", type: "choice", choicesKey: "states", fieldByTable: { problem: "problem_state" } },
  { key: "priority", label: "Priority", field: "priority", type: "choice", choicesKey: "priorities" },
  { key: "createdOn", label: "Created", field: "sys_created_on", type: "date" }
];

test("filterSetToRows maps SN field names back to definition keys", () => {
  const rows = filterSetToRows(
    {
      table: "incident",
      conditions: [
        { join: "AND", field: "assigned_to", oper: "isEmpty", value: "", value2: "" },
        { join: "OR", field: "state", oper: "eq", value: "2", value2: "" }
      ]
    },
    COND_FIELDS
  );

  assert.deepEqual(rows, [
    { join: "AND", field: "assignedTo", op: "isEmpty", value: "", value2: "" },
    { join: "OR", field: "state", op: "eq", value: "2", value2: "" }
  ]);
});

test("filterSetToRows resolves a per-table field override (problem_state -> state)", () => {
  const rows = filterSetToRows(
    { table: "problem", conditions: [{ join: "AND", field: "problem_state", oper: "eq", value: "2", value2: "" }] },
    COND_FIELDS
  );
  assert.deepEqual(rows, [{ join: "AND", field: "state", op: "eq", value: "2", value2: "" }]);
});

test("filterSetToRows carries a between date range's second value", () => {
  const rows = filterSetToRows(
    {
      table: "incident",
      conditions: [{ join: "AND", field: "sys_created_on", oper: "between", value: "2026-01-01", value2: "2026-02-01" }]
    },
    COND_FIELDS
  );
  assert.deepEqual(rows, [
    { join: "AND", field: "createdOn", op: "between", value: "2026-01-01", value2: "2026-02-01" }
  ]);
});

test("filterSetToRows drops conditions whose field is unknown", () => {
  const rows = filterSetToRows(
    {
      table: "incident",
      conditions: [
        { join: "AND", field: "nonexistent_field", oper: "eq", value: "x", value2: "" },
        { join: "AND", field: "priority", oper: "eq", value: "1", value2: "" }
      ]
    },
    COND_FIELDS
  );
  assert.deepEqual(rows, [{ join: "AND", field: "priority", op: "eq", value: "1", value2: "" }]);
});

test("filterSetToRows normalizes the first row's join to AND", () => {
  const rows = filterSetToRows(
    { table: "incident", conditions: [{ join: "OR", field: "priority", oper: "eq", value: "1", value2: "" }] },
    COND_FIELDS
  );
  assert.equal(rows[0].join, "AND");
});

test("filterSetToRows tolerates a missing conditions array", () => {
  assert.deepEqual(filterSetToRows({ table: "incident", conditions: undefined }, COND_FIELDS), []);
});

test("describeFilterSet resolves a problem_state value to its label via the set's own table", () => {
  const summary = describeFilterSet(
    { table: "problem", conditions: [{ join: "AND", field: "problem_state", oper: "eq", value: "103", value2: "" }] },
    COND_FIELDS
  );
  assert.match(summary, /root cause analysis/);
  assert.doesNotMatch(summary, /\bis 103\b/);
});

test("describeFilterSet resolves a change_request state value independent of any live ticket type", () => {
  const summary = describeFilterSet(
    { table: "change_request", conditions: [{ join: "AND", field: "state", oper: "eq", value: "-3", value2: "" }] },
    COND_FIELDS
  );
  assert.match(summary, /Authorize/);
});

test("describeFilterSet resolves an incident state value to its label", () => {
  const summary = describeFilterSet(
    { table: "incident", conditions: [{ join: "AND", field: "state", oper: "eq", value: "7", value2: "" }] },
    COND_FIELDS
  );
  assert.match(summary, /Closed/);
});
