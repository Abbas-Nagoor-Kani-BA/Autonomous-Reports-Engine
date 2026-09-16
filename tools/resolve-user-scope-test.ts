import test from "node:test";
import assert from "node:assert/strict";

import { ServiceNowRemote, FakeSnRemote } from "../data/datasource/sn-remote.ts";

function ref(displayValue, value) {
  return { display_value: displayValue, value };
}

/**
 * A fake ServiceNowClientLike that records fetchRecords calls and returns
 * scripted rows keyed by table so the query sequence can be asserted.
 */
function fakeClient(rowsByTable, userId = "u-self") {
  const calls = [];
  return {
    calls,
    selfName: null,
    async currentUserId() {
      calls.push({ method: "currentUserId", args: [] });
      return userId;
    },
    async userNameById(id) {
      calls.push({ method: "userNameById", args: [id] });
      return this.selfName;
    },
    groupMemberRows: { rows: [], truncated: false },
    async fetchGroupMemberRows(groupName) {
      calls.push({ method: "fetchGroupMemberRows", args: [groupName] });
      return this.groupMemberRows;
    },
    groupCiRows: { rows: [], truncated: false },
    async fetchGroupCiRows(groupName) {
      calls.push({ method: "fetchGroupCiRows", args: [groupName] });
      return this.groupCiRows;
    },
    async fetchRecords(table, query, fields, limit) {
      calls.push({ method: "fetchRecords", args: [table, query, fields, limit] });
      const bucket = rowsByTable[table];
      if (typeof bucket === "function") return bucket(query);
      return bucket || [];
    },
    async count() {
      throw new Error("not used");
    },
    async fetchAllRecords() {
      throw new Error("not used");
    },
    async fetchTimelineEvents() {
      throw new Error("not used");
    }
  };
}

test("resolveUserScope reads groups first, then members, and shapes both", async () => {
  const client = fakeClient({
    sys_user_grmember: (query) => {
      if (query.startsWith("user=")) {
        return [
          { group: ref("g1", "g1"), "group.name": ref("Network Ops", "Network Ops"), user: ref("Me", "u-self") },
          { group: ref("g2", "g2"), "group.name": ref("Service Desk", "Service Desk"), user: ref("Me", "u-self") }
        ];
      }
      // members-of-groups query. The `user` reference display value is the
      // LOGIN/email on this instance; the full name is only in user.name.
      return [
        {
          user: ref("me@ba.com", "u-self"),
          "user.name": ref("Abbas Nagoor Kani", "Abbas Nagoor Kani"),
          "user.active": ref("true", "true"),
          group: ref("g1", "g1")
        },
        {
          user: ref("alice@ba.com", "u1"),
          "user.name": ref("Alice Adams", "Alice Adams"),
          "user.active": ref("true", "true"),
          group: ref("g2", "g2")
        }
      ];
    }
  });
  const remote = new ServiceNowRemote(client);

  const scope = await remote.resolveUserScope("u-self");

  assert.deepEqual(scope.queues, ["Network Ops", "Service Desk"]);
  // The current user's OWN full name is present, and full names (not logins)
  // are used throughout.
  assert.deepEqual(scope.members, ["Abbas Nagoor Kani", "Alice Adams"]);
  assert.equal(scope.userId, "u-self");

  const fetches = client.calls.filter((c) => c.method === "fetchRecords");
  assert.equal(fetches.length, 2, "one groups read, one members read");
  assert.ok(fetches[0].args[1].startsWith("user=u-self"), "first read filters by the user's memberships");
  assert.match(fetches[0].args[1], /group\.active=true/);
  assert.deepEqual(fetches[0].args[2], ["group", "group.name"], "groups read requests dot-walked group.name");
  assert.ok(fetches[1].args[1].startsWith("groupIN"), "second read filters by the resolved group ids");
  assert.match(fetches[1].args[1], /g1,g2/);
  assert.match(fetches[1].args[1], /user\.active=true/);
  assert.deepEqual(fetches[1].args[2], ["user", "user.name", "user.active", "group"], "members read requests dot-walked user.name");
});

test("resolveUserScope includes the current user even when the member read omits them", async () => {
  const client = fakeClient({
    sys_user_grmember: (query) => {
      if (query.startsWith("user=")) {
        return [{ group: ref("g1", "g1"), "group.name": ref("Network Ops", "Network Ops"), user: ref("Me", "u-self") }];
      }
      // The group-member read returns OTHER people but not the current user
      // (e.g. the user belongs via role/manager access, no grmember row).
      return [
        { user: ref("alice@ba.com", "u1"), "user.name": ref("Alice Adams", "Alice Adams"), "user.active": ref("true", "true"), group: ref("g1", "g1") }
      ];
    }
  });
  client.selfName = "Abbas Nagoor Kani";
  const remote = new ServiceNowRemote(client);

  const scope = await remote.resolveUserScope("u-self");

  assert.ok(scope.members.includes("Abbas Nagoor Kani"), "the current user's own name is present");
  assert.ok(scope.members.includes("Alice Adams"), "other members are still present");
  assert.ok(client.calls.some((c) => c.method === "userNameById" && c.args[0] === "u-self"), "fetched own name by id");
});

test("resolveUserScope falls back to currentUserId() when no id is passed", async () => {
  const client = fakeClient({ sys_user_grmember: [] }, "resolved-self");
  const remote = new ServiceNowRemote(client);

  const scope = await remote.resolveUserScope();

  assert.equal(scope.userId, "resolved-self");
  assert.ok(client.calls.some((c) => c.method === "currentUserId"), "asked the endpoint for the id");
});

test("resolveUserScope returns empty members when the user has no groups", async () => {
  const client = fakeClient({ sys_user_grmember: [] });
  const remote = new ServiceNowRemote(client);

  const scope = await remote.resolveUserScope("u-self");
  assert.deepEqual(scope.queues, []);
  assert.deepEqual(scope.members, []);
  // No second (members) read when there are no groups.
  assert.equal(client.calls.filter((c) => c.method === "fetchRecords").length, 1);
});

test("resolveUserScope throws a friendly error when no user id can be resolved", async () => {
  const client = fakeClient({ sys_user_grmember: [] }, null);
  const remote = new ServiceNowRemote(client);
  await assert.rejects(remote.resolveUserScope(), /Could not determine the current ServiceNow user/);
});

test("FakeSnRemote.resolveUserScope records the call and returns scripted scope", async () => {
  const fake = new FakeSnRemote();
  fake.scope = { queues: ["Q1"], members: ["M1"], userId: "u1" };
  const scope = await fake.resolveUserScope("u1");
  assert.deepEqual(scope, { queues: ["Q1"], members: ["M1"], userId: "u1" });
  assert.deepEqual(fake.calls.at(-1), { method: "resolveUserScope", args: ["u1"] });
});

test("FakeSnRemote.resolveUserScope surfaces a scripted error", async () => {
  const fake = new FakeSnRemote();
  fake.scopeError = new Error("You do not have permission to read sys_user_grmember");
  await assert.rejects(fake.resolveUserScope("u1"), /do not have permission/);
});

test("resolveGroupMembers shapes a group's member rows (full names)", async () => {
  const client = fakeClient({});
  client.groupMemberRows = {
    rows: [
      { user: ref("me@ba.com", "u-self"), "user.name": ref("Abbas Nagoor Kani", "Abbas Nagoor Kani"), "user.active": ref("true", "true") },
      { user: ref("alice@ba.com", "u1"), "user.name": ref("Alice Adams", "Alice Adams"), "user.active": ref("true", "true") }
    ],
    truncated: false
  };
  const remote = new ServiceNowRemote(client);
  const res = await remote.resolveGroupMembers("Network Ops");
  assert.deepEqual(res.members, ["Abbas Nagoor Kani", "Alice Adams"]);
  assert.equal(res.truncated, false);
  assert.deepEqual(client.calls.at(-1), { method: "fetchGroupMemberRows", args: ["Network Ops"] });
});

test("resolveGroupMembers propagates the truncated flag", async () => {
  const client = fakeClient({});
  client.groupMemberRows = {
    rows: [{ "user.name": ref("Only One", "Only One"), "user.active": ref("true", "true") }],
    truncated: true
  };
  const remote = new ServiceNowRemote(client);
  const res = await remote.resolveGroupMembers("Huge Group");
  assert.equal(res.truncated, true);
});

test("FakeSnRemote.resolveGroupMembers returns scripted members and records the call", async () => {
  const fake = new FakeSnRemote();
  fake.groupMembers["Network Ops"] = { members: ["Alice Adams"], truncated: false };
  const res = await fake.resolveGroupMembers("Network Ops");
  assert.deepEqual(res, { members: ["Alice Adams"], truncated: false });
  assert.deepEqual(fake.calls.at(-1), { method: "resolveGroupMembers", args: ["Network Ops"] });
});

test("resolveGroupConfigItems shapes a group's cmdb_ci rows (names)", async () => {
  const client = fakeClient({});
  client.groupCiRows = {
    rows: [
      { sys_id: ref("c1", "c1"), name: ref("RMS (prd)", "RMS (prd)") },
      { sys_id: ref("c2", "c2"), name: ref("Billing API", "Billing API") },
      { sys_id: ref("c1", "c1"), name: ref("RMS (prd)", "RMS (prd)") }
    ],
    truncated: false
  };
  const remote = new ServiceNowRemote(client);
  const res = await remote.resolveGroupConfigItems("Network Ops");
  assert.deepEqual(res.items, ["RMS (prd)", "Billing API"]);
  assert.equal(res.truncated, false);
  assert.deepEqual(client.calls.at(-1), { method: "fetchGroupCiRows", args: ["Network Ops"] });
});

test("resolveGroupConfigItems propagates the truncated flag", async () => {
  const client = fakeClient({});
  client.groupCiRows = { rows: [{ name: ref("Only CI", "Only CI") }], truncated: true };
  const remote = new ServiceNowRemote(client);
  const res = await remote.resolveGroupConfigItems("Huge Group");
  assert.equal(res.truncated, true);
});

test("FakeSnRemote.resolveGroupConfigItems returns scripted items and records the call", async () => {
  const fake = new FakeSnRemote();
  fake.groupConfigItems["Network Ops"] = { items: ["RMS (prd)"], truncated: false };
  const res = await fake.resolveGroupConfigItems("Network Ops");
  assert.deepEqual(res, { items: ["RMS (prd)"], truncated: false });
  assert.deepEqual(fake.calls.at(-1), { method: "resolveGroupConfigItems", args: ["Network Ops"] });
});
