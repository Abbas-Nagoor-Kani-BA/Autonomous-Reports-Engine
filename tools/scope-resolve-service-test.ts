import test from "node:test";
import assert from "node:assert/strict";

import { Container } from "../di/container.ts";
import { SCOPE_RESOLVE_SERVICE, SN_REMOTE_FACTORY } from "../di/tokens.ts";
import { FakeSnRemote } from "../data/datasource/sn-remote.ts";
import { ScopeResolveService } from "../services/scope-resolve-service.ts";

const INSTANCE = "https://dev385266.service-now.com";

function harness(remote) {
  const c = new Container();
  c.registerValue(SN_REMOTE_FACTORY, () => remote);
  c.registerClass(SCOPE_RESOLVE_SERVICE, ScopeResolveService, { singleton: true });
  return c.resolve(SCOPE_RESOLVE_SERVICE);
}

test("resolve returns the remote's scope on success", async () => {
  const remote = new FakeSnRemote();
  remote.scope = {
    queues: ["Network Ops", "Service Desk"],
    members: ["Alice", "Bob"],
    userId: "u1"
  };
  const svc = harness(remote);

  const scope = await svc.resolve({ instanceUrl: INSTANCE, currentUserId: "u1" });

  assert.deepEqual(scope.queues, ["Network Ops", "Service Desk"]);
  assert.deepEqual(scope.members, ["Alice", "Bob"]);
  assert.deepEqual(remote.calls.at(-1), { method: "resolveUserScope", args: ["u1"] });
});

test("resolve maps a 403 to the friendly add-manually message", async () => {
  const remote = new FakeSnRemote();
  remote.scopeError = new Error("Auth error 403 (relay, token sent)");
  const svc = harness(remote);
  await assert.rejects(
    svc.resolve({ instanceUrl: INSTANCE }),
    /add queues and team members manually/i
  );
});

test("resolve maps a permission-worded error to the friendly message", async () => {
  const remote = new FakeSnRemote();
  remote.scopeError = new Error("You do not have permission to read sys_user_grmember");
  const svc = harness(remote);
  await assert.rejects(
    svc.resolve({ instanceUrl: INSTANCE }),
    /add queues and team members manually/i
  );
});

test("resolve treats an empty membership set as a graceful failure", async () => {
  const remote = new FakeSnRemote();
  remote.scope = { queues: [], members: [], userId: "u1" };
  const svc = harness(remote);
  await assert.rejects(
    svc.resolve({ instanceUrl: INSTANCE }),
    /add queues and team members manually/i
  );
});

test("resolve rethrows unexpected (non-permission) errors unchanged", async () => {
  const remote = new FakeSnRemote();
  remote.scopeError = new Error("network went away");
  const svc = harness(remote);
  await assert.rejects(svc.resolve({ instanceUrl: INSTANCE }), /network went away/);
});

test("resolve requires an instance URL", async () => {
  const svc = harness(new FakeSnRemote());
  await assert.rejects(svc.resolve({ instanceUrl: "" }), /instance URL/i);
});

test("resolveGroupMembers returns the group's members and truncated flag", async () => {
  const remote = new FakeSnRemote();
  remote.groupMembers["Network Ops"] = { members: ["Alice", "Bob"], truncated: true };
  const svc = harness(remote);
  const res = await svc.resolveGroupMembers({ instanceUrl: INSTANCE, group: "Network Ops" });
  assert.deepEqual(res.members, ["Alice", "Bob"]);
  assert.equal(res.truncated, true);
});

test("resolveGroupMembers treats an empty group as valid (not an error)", async () => {
  const remote = new FakeSnRemote();
  remote.groupMembers["Empty Group"] = { members: [], truncated: false };
  const svc = harness(remote);
  const res = await svc.resolveGroupMembers({ instanceUrl: INSTANCE, group: "Empty Group" });
  assert.deepEqual(res.members, []);
});

test("resolveGroupMembers maps a 403 to the friendly add-manually message", async () => {
  const remote = new FakeSnRemote();
  remote.groupMembersError = new Error("Auth error 403");
  const svc = harness(remote);
  await assert.rejects(
    svc.resolveGroupMembers({ instanceUrl: INSTANCE, group: "X" }),
    /add queues and team members manually/i
  );
});

test("resolveGroupMembers requires a group name", async () => {
  const svc = harness(new FakeSnRemote());
  await assert.rejects(
    svc.resolveGroupMembers({ instanceUrl: INSTANCE, group: "  " }),
    /group name/i
  );
});

test("resolveGroupConfigItems returns the group's CIs and truncated flag", async () => {
  const remote = new FakeSnRemote();
  remote.groupConfigItems["Network Ops"] = { items: ["RMS (prd)", "Billing API"], truncated: true };
  const svc = harness(remote);
  const res = await svc.resolveGroupConfigItems({ instanceUrl: INSTANCE, group: "Network Ops" });
  assert.deepEqual(res.items, ["RMS (prd)", "Billing API"]);
  assert.equal(res.truncated, true);
});

test("resolveGroupConfigItems treats an empty group as valid", async () => {
  const remote = new FakeSnRemote();
  remote.groupConfigItems["Empty"] = { items: [], truncated: false };
  const svc = harness(remote);
  const res = await svc.resolveGroupConfigItems({ instanceUrl: INSTANCE, group: "Empty" });
  assert.deepEqual(res.items, []);
});

test("resolveGroupConfigItems maps a 403 to the friendly message", async () => {
  const remote = new FakeSnRemote();
  remote.groupConfigItemsError = new Error("Auth error 403");
  const svc = harness(remote);
  await assert.rejects(
    svc.resolveGroupConfigItems({ instanceUrl: INSTANCE, group: "X" }),
    /add queues and team members manually/i
  );
});

test("resolveGroupConfigItems requires a group name", async () => {
  const svc = harness(new FakeSnRemote());
  await assert.rejects(
    svc.resolveGroupConfigItems({ instanceUrl: INSTANCE, group: "" }),
    /group name/i
  );
});
