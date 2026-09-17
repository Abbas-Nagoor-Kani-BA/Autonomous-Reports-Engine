import test from "node:test";
import assert from "node:assert/strict";

import { pickUserId } from "../data/datasource/sn-transport.ts";

test("pickUserId prefers the REST current_user userID (a real sys_id)", () => {
  const r = pickUserId({
    restUserId: "43a3c7713bdfe610d5d5232a85e45a0b",
    pageUserId: "sysid123",
    pageUserName: "alice",
    tableUserId: "fromtable"
  });
  assert.deepEqual(r, { id: "43a3c7713bdfe610d5d5232a85e45a0b", source: "rest" });
});

test("pickUserId falls back to the NOW.user / g_user_id page id when REST is absent", () => {
  const r = pickUserId({
    restUserId: null,
    pageUserId: "sysid123",
    pageUserName: "alice",
    tableUserId: "fromtable"
  });
  assert.deepEqual(r, { id: "sysid123", source: "g_user_id" });
});

test("pickUserId falls back to g_user (user_name) when no ids are present", () => {
  const r = pickUserId({
    restUserId: null,
    pageUserId: null,
    pageUserName: "alice",
    tableUserId: "fromtable"
  });
  assert.deepEqual(r, { id: "alice", source: "g_user" });
});

test("pickUserId falls back to a table-resolved id last", () => {
  const r = pickUserId({
    restUserId: null,
    pageUserId: null,
    pageUserName: null,
    tableUserId: "fromtable"
  });
  assert.deepEqual(r, { id: "fromtable", source: "table" });
});

test("pickUserId skips blank/whitespace candidates", () => {
  const r = pickUserId({
    restUserId: "  ",
    pageUserId: "   ",
    pageUserName: "",
    tableUserId: "  real  "
  });
  assert.deepEqual(r, { id: "real", source: "table" });
});

test("pickUserId returns null when nothing is resolvable", () => {
  assert.equal(
    pickUserId({ restUserId: null, pageUserId: null, pageUserName: null, tableUserId: null }),
    null
  );
  assert.equal(pickUserId({}), null);
});
