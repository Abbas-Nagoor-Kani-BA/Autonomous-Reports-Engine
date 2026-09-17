import test from "node:test";
import assert from "node:assert/strict";
import "./helpers/dom-env.mjs";
import { MemberPicker } from "../settings/components/member-picker.ts";

function mount() {
  const root = document.createElement("div");
  document.body.appendChild(root);
  const picker = new MemberPicker(root, {}, {});
  return { root, picker };
}

test("openFor renders a checkbox per member, all checked by default", () => {
  const { root, picker } = mount();
  picker.openFor({ group: "Network Ops", members: ["Alice", "Bob", "Carol"], onConfirm: () => {} });
  assert.equal(root.classList.contains("hidden"), false, "dialog is open");
  const boxes = root.querySelectorAll(".memberCheckbox");
  assert.equal(boxes.length, 3);
  assert.ok(
    [...boxes].every((b) => b.checked),
    "all checked by default"
  );
  assert.match(root.querySelector("h2").textContent, /Network Ops/);
});

test("Add returns only the checked members and closes", () => {
  const { root, picker } = mount();
  let got = null;
  picker.openFor({
    group: "G",
    members: ["Alice", "Bob", "Carol"],
    onConfirm: (names) => {
      got = names;
    }
  });
  // Uncheck Bob (index 1).
  const boxes = root.querySelectorAll(".memberCheckbox");
  boxes[1].checked = false;
  boxes[1].dispatchEvent(new window.Event("change", { bubbles: true }));
  root.querySelector(".primary").click();
  assert.deepEqual(got, ["Alice", "Carol"]);
  assert.equal(root.classList.contains("hidden"), true, "dialog closed after Add");
});

test("Select none then Add returns an empty list", () => {
  const { root, picker } = mount();
  let got = null;
  picker.openFor({
    group: "G",
    members: ["Alice", "Bob"],
    onConfirm: (names) => {
      got = names;
    }
  });
  const buttons = [...root.querySelectorAll("button")];
  buttons.find((b) => b.textContent === "Select none").click();
  root.querySelector(".primary").click();
  assert.deepEqual(got, []);
});

test("Select all re-checks everything", () => {
  const { root, picker } = mount();
  let got = null;
  picker.openFor({
    group: "G",
    members: ["Alice", "Bob"],
    onConfirm: (names) => {
      got = names;
    }
  });
  const buttons = [...root.querySelectorAll("button")];
  buttons.find((b) => b.textContent === "Select none").click();
  buttons.find((b) => b.textContent === "Select all").click();
  root.querySelector(".primary").click();
  assert.deepEqual(got, ["Alice", "Bob"]);
});

test("Cancel closes without calling onConfirm", () => {
  const { root, picker } = mount();
  let called = false;
  picker.openFor({
    group: "G",
    members: ["Alice"],
    onConfirm: () => {
      called = true;
    }
  });
  [...root.querySelectorAll("button")].find((b) => b.textContent === "Cancel").click();
  assert.equal(called, false);
  assert.equal(root.classList.contains("hidden"), true);
});

test("truncation notice shows only when flagged", () => {
  const { root, picker } = mount();
  picker.openFor({ group: "Big", members: ["A", "B"], truncated: true, onConfirm: () => {} });
  const notice = root.querySelector(".memberNotice");
  assert.equal(notice.hidden, false);
  assert.match(notice.textContent, /truncated/i);

  picker.openFor({ group: "Small", members: ["A"], truncated: false, onConfirm: () => {} });
  assert.equal(root.querySelector(".memberNotice").hidden, true);
});

test("empty member list shows a 'no active members' count", () => {
  const { root, picker } = mount();
  picker.openFor({ group: "Empty", members: [], onConfirm: () => {} });
  assert.match(root.querySelector(".memberCount").textContent, /no active members/i);
});

test("an explicit title overrides the default 'Members of' heading (e.g. for CIs)", () => {
  const { root, picker } = mount();
  picker.openFor({
    group: "Network Ops",
    members: ["RMS (prd)"],
    title: 'Configuration items of "Network Ops"',
    onConfirm: () => {}
  });
  assert.equal(root.querySelector("h2").textContent, 'Configuration items of "Network Ops"');
});
