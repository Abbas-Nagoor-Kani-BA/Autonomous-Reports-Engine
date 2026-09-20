import test from "node:test";
import assert from "node:assert/strict";

import { Container } from "../di/container.ts";
import { SCTASK_BULK_SERVICE, SN_REMOTE_FACTORY } from "../di/tokens.ts";
import { FakeSnRemote } from "../data/datasource/sn-remote.ts";
import { SctaskBulkService, SCTASK_LIST_FIELDS } from "../services/sctask-bulk-service.ts";

const INSTANCE = "https://dev.service-now.com";

function harness(remote: FakeSnRemote): SctaskBulkService {
  const c = new Container();
  c.registerValue(SN_REMOTE_FACTORY, () => remote);
  c.registerClass(SCTASK_BULK_SERVICE, SctaskBulkService, { singleton: true });
  return c.resolve(SCTASK_BULK_SERVICE);
}

/** A raw sc_task record in the display+value shape the Table API returns. */
function rawTask(sysId: string, number: string, short: string, state: string) {
  return {
    sys_id: { value: sysId, display_value: sysId },
    number: { value: number, display_value: number },
    short_description: { value: short, display_value: short },
    state: { value: "1", display_value: state },
    assignment_group: { value: "g1", display_value: "Service Desk" },
    assigned_to: { value: "u1", display_value: "Alice" },
    sys_updated_on: { value: "2026-09-01 10:00:00", display_value: "2026-09-01 10:00:00" }
  };
}

test('scope "me" queries assigned_to=<userId>^active=true and normalizes rows', async () => {
  const remote = new FakeSnRemote();
  const query = "assigned_to=u1^active=true";
  remote.sctasks[query] = [rawTask("s1", "SCTASK0001", "Reset VPN", "Open")];
  const svc = harness(remote);

  const rows = await svc.listAssigned({ instanceUrl: INSTANCE, scope: "me", currentUserId: "u1" });

  assert.equal(rows.length, 1);
  assert.deepEqual(rows[0], {
    sysId: "s1",
    number: "SCTASK0001",
    shortDescription: "Reset VPN",
    state: "Open",
    assignmentGroup: "Service Desk",
    assignedTo: "Alice",
    updatedOn: "2026-09-01 10:00:00"
  });
  assert.deepEqual(remote.calls.at(-1), {
    method: "listSctasks",
    args: [query, SCTASK_LIST_FIELDS]
  });
});

test('scope "me" resolves the current user id from the remote when not provided', async () => {
  const remote = new FakeSnRemote();
  remote.userId = "u9";
  remote.sctasks["assigned_to=u9^active=true"] = [rawTask("s2", "SCTASK0002", "x", "WIP")];
  const svc = harness(remote);

  const rows = await svc.listAssigned({ instanceUrl: INSTANCE, scope: "me" });
  assert.equal(rows[0].number, "SCTASK0002");
  assert.ok(remote.calls.some((c) => c.method === "currentUserId"));
});

test('scope "groups" queries assignment_groupIN<ids>^active=true', async () => {
  const remote = new FakeSnRemote();
  remote.userGroupIds["u1"] = ["g1", "g2"];
  const query = "assignment_groupINg1,g2^active=true";
  remote.sctasks[query] = [rawTask("s3", "SCTASK0003", "Onboard", "Open")];
  const svc = harness(remote);

  const rows = await svc.listAssigned({
    instanceUrl: INSTANCE,
    scope: "groups",
    currentUserId: "u1"
  });
  assert.equal(rows[0].number, "SCTASK0003");
  assert.deepEqual(remote.calls.at(-1), {
    method: "listSctasks",
    args: [query, SCTASK_LIST_FIELDS]
  });
});

test('scope "groups" returns [] without listing when the user has no groups', async () => {
  const remote = new FakeSnRemote();
  remote.userGroupIds["u1"] = [];
  const svc = harness(remote);

  const rows = await svc.listAssigned({
    instanceUrl: INSTANCE,
    scope: "groups",
    currentUserId: "u1"
  });
  assert.deepEqual(rows, []);
  assert.ok(!remote.calls.some((c) => c.method === "listSctasks"));
});

test("listAssigned throws when no current user can be determined", async () => {
  const remote = new FakeSnRemote();
  remote.userId = null;
  const svc = harness(remote);
  await assert.rejects(
    svc.listAssigned({ instanceUrl: INSTANCE, scope: "me" }),
    /could not determine the current servicenow user/i
  );
});

test("listAssigned requires an instance URL", async () => {
  const svc = harness(new FakeSnRemote());
  await assert.rejects(svc.listAssigned({ instanceUrl: "", scope: "me" }), /instance URL/i);
});
