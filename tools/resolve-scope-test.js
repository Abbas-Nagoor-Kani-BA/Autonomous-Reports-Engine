import test from "node:test";
import assert from "node:assert/strict";

import {
  queuesFromGroupMemberships,
  queuesFromGroups,
  queuesFromMembershipNames,
  membersFromGroupMemberships,
  membersFromMembershipNames,
  membersFromUsers,
  groupIdsFromMemberships,
  cisFromRows,
  mergeNames,
  isActive,
  valueOf
} from "../core/scope/resolve-scope.ts";

/** A Table-API reference cell as produced by sysparm_display_value=all. */
function ref(displayValue, value) {
  return { display_value: displayValue, value };
}

test("queuesFromGroupMemberships extracts group display names, deduped", () => {
  const rows = [
    { group: ref("Network Ops", "g1") },
    { group: ref("Network Ops", "g1") },
    { group: ref("Service Desk", "g2") }
  ];
  assert.deepEqual(queuesFromGroupMemberships(rows), ["Network Ops", "Service Desk"]);
});

test("queuesFromGroupMemberships dedupes case-insensitively but keeps first casing", () => {
  const rows = [{ group: ref("Network Ops", "g1") }, { group: ref("NETWORK OPS", "g1") }];
  assert.deepEqual(queuesFromGroupMemberships(rows), ["Network Ops"]);
});

test("queuesFromGroupMemberships handles empty / nullish input", () => {
  assert.deepEqual(queuesFromGroupMemberships([]), []);
  assert.deepEqual(queuesFromGroupMemberships(null), []);
  assert.deepEqual(queuesFromGroupMemberships(undefined), []);
});

test("queuesFromGroups reads sys_user_group name and drops inactive groups", () => {
  const rows = [
    { name: ref("Network Ops", "n"), active: "true" },
    { name: ref("Legacy Group", "l"), active: "false" },
    { name: ref("Service Desk", "s") }
  ];
  assert.deepEqual(queuesFromGroups(rows), ["Network Ops", "Service Desk"]);
});

test("membersFromGroupMemberships extracts user display names, deduped", () => {
  const rows = [
    { user: ref("Alice Adams", "u1") },
    { user: ref("Bob Brown", "u2") },
    { user: ref("Alice Adams", "u1") }
  ];
  assert.deepEqual(membersFromGroupMemberships(rows), ["Alice Adams", "Bob Brown"]);
});

test("membersFromGroupMemberships drops rows flagged inactive via active field", () => {
  const rows = [
    { user: ref("Alice Adams", "u1"), active: true },
    { user: ref("Inactive Ivan", "u3"), active: false }
  ];
  assert.deepEqual(membersFromGroupMemberships(rows), ["Alice Adams"]);
});

test("membersFromMembershipNames reads dot-walked user.name (full name), not the login display value", () => {
  const rows = [
    // On this instance the `user` reference display value is the login/email;
    // the full name lives in the dot-walked user.name field.
    {
      user: ref("me@ba.com", "u-self"),
      "user.name": ref("Abbas Nagoor Kani", "Abbas Nagoor Kani"),
      "user.active": ref("true", "true")
    },
    {
      user: ref("alice@ba.com", "u1"),
      "user.name": ref("Alice Adams", "Alice Adams"),
      "user.active": ref("true", "true")
    }
  ];
  assert.deepEqual(membersFromMembershipNames(rows), ["Abbas Nagoor Kani", "Alice Adams"]);
});

test("membersFromMembershipNames drops rows whose user.active is false", () => {
  const rows = [
    { "user.name": ref("Alice Adams", "Alice Adams"), "user.active": ref("true", "true") },
    { "user.name": ref("Inactive Ivan", "Inactive Ivan"), "user.active": ref("false", "false") }
  ];
  assert.deepEqual(membersFromMembershipNames(rows), ["Alice Adams"]);
});

test("membersFromMembershipNames falls back to the user reference when user.name is absent", () => {
  const rows = [{ user: ref("Fallback Name", "u9") }];
  assert.deepEqual(membersFromMembershipNames(rows), ["Fallback Name"]);
});

test("queuesFromMembershipNames reads dot-walked group.name", () => {
  const rows = [
    { group: ref("g1", "g1"), "group.name": ref("Network Ops", "Network Ops") },
    { group: ref("g2", "g2"), "group.name": ref("Service Desk", "Service Desk") }
  ];
  assert.deepEqual(queuesFromMembershipNames(rows), ["Network Ops", "Service Desk"]);
});

test("membersFromUsers reads sys_user name and filters inactive users", () => {
  const rows = [
    { name: ref("Alice Adams", "u1"), active: "true" },
    { name: ref("Inactive Ivan", "u3"), active: "false" },
    { name: ref("Carol Clark", "u4") }
  ];
  assert.deepEqual(membersFromUsers(rows), ["Alice Adams", "Carol Clark"]);
});

test("isActive treats missing/true forms as active and only explicit false as inactive", () => {
  assert.equal(isActive({}), true);
  assert.equal(isActive({ active: true }), true);
  assert.equal(isActive({ active: "true" }), true);
  assert.equal(isActive({ active: ref("Yes", "true") }), true);
  assert.equal(isActive({ active: false }), false);
  assert.equal(isActive({ active: "false" }), false);
  assert.equal(isActive({ active: "0" }), false);
  assert.equal(isActive({ active: ref("No", "false") }), false);
});

test("groupIdsFromMemberships returns unique group sys_ids", () => {
  const rows = [
    { group: ref("Network Ops", "g1") },
    { group: ref("Service Desk", "g2") },
    { group: ref("Network Ops", "g1") }
  ];
  assert.deepEqual(groupIdsFromMemberships(rows), ["g1", "g2"]);
});

test("cisFromRows extracts cmdb_ci names, deduped case-insensitively", () => {
  const rows = [
    { sys_id: ref("c1", "c1"), name: ref("RMS (prd)", "RMS (prd)") },
    { sys_id: ref("c2", "c2"), name: ref("Billing API", "Billing API") },
    { sys_id: ref("c3", "c3"), name: ref("rms (prd)", "rms (prd)") }
  ];
  assert.deepEqual(cisFromRows(rows), ["RMS (prd)", "Billing API"]);
});

test("cisFromRows skips blank names and handles empty input", () => {
  assert.deepEqual(cisFromRows([{ name: ref("", "") }, { name: ref("Real CI", "Real CI") }]), [
    "Real CI"
  ]);
  assert.deepEqual(cisFromRows([]), []);
  assert.deepEqual(cisFromRows(null), []);
});

test("valueOf prefers the raw value of a reference cell", () => {
  assert.equal(valueOf(ref("Network Ops", "g1")), "g1");
  assert.equal(valueOf("plain"), "plain");
  assert.equal(valueOf(null), "");
});

test("mergeNames appends new names, preserves existing order, dedupes case-insensitively", () => {
  assert.deepEqual(mergeNames(["Queue A"], ["Queue B", "queue a"]), ["Queue A", "Queue B"]);
  assert.deepEqual(mergeNames([], ["X"]), ["X"]);
  assert.deepEqual(mergeNames(["X"], []), ["X"]);
  assert.deepEqual(mergeNames(null, null), []);
});

test("mergeNames is idempotent", () => {
  const once = mergeNames(["Queue A"], ["Queue B"]);
  const twice = mergeNames(once, ["Queue B", "Queue A"]);
  assert.deepEqual(twice, ["Queue A", "Queue B"]);
});
