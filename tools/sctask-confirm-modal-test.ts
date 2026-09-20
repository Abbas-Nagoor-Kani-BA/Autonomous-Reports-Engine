import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { Window } from "happy-dom";

const html = readFileSync(new URL("../sctask/sctask.html", import.meta.url), "utf8")
  .replace(/<script[\s\S]*?<\/script>/gi, "")
  .replace(/<link[^>]*>/gi, "");

const win = new Window({ url: "https://sctask.local/" });
globalThis.window = win as never;
globalThis.document = win.document as never;
globalThis.HTMLElement = win.HTMLElement as never;
globalThis.HTMLButtonElement = win.HTMLButtonElement as never;
globalThis.Event = win.Event as never;
win.document.body.innerHTML = html;

const { ConfirmModal } = await import("../sctask/confirm-modal.ts");

function mount(events = {}) {
  win.document.body.innerHTML = html;
  const $ = (id: string) => win.document.getElementById(id) as unknown as HTMLElement;
  const modal = new ConfirmModal(
    {
      root: $("confirmModal"),
      intro: $("confirmIntro"),
      list: $("confirmList"),
      summary: $("confirmSummary"),
      postBtn: $("confirmPost") as unknown as HTMLButtonElement,
      cancelBtn: $("confirmCancel") as unknown as HTMLButtonElement,
      doneBtn: $("confirmDone") as unknown as HTMLButtonElement,
      retryBtn: $("retryFailedBtn") as unknown as HTMLButtonElement,
      closeBtn: $("confirmClose") as unknown as HTMLButtonElement
    },
    events
  );
  return { modal, $ };
}

const ITEMS = [
  { sysId: "s1", comments: "hello cust", workNotes: "internal note" },
  { sysId: "s2", comments: "", workNotes: "just a note" }
];
const ROWS = [
  { sysId: "s1", number: "SCTASK0001", shortDescription: "", state: "", assignmentGroup: "", assignedTo: "", updatedOn: "" },
  { sysId: "s2", number: "SCTASK0002", shortDescription: "", state: "", assignmentGroup: "", assignedTo: "", updatedOn: "" }
];

test("open shows resolved per-ticket text and the target count", () => {
  const { modal, $ } = mount();
  modal.open(ITEMS, ROWS);
  assert.ok(!$("confirmModal").classList.contains("hidden"));
  assert.match($("confirmIntro").textContent || "", /2 SCTASKs/);
  const list = $("confirmList");
  assert.match(list.textContent || "", /SCTASK0001/);
  assert.match(list.textContent || "", /hello cust/);
  assert.match(list.textContent || "", /internal note/);
  // Post visible, Done hidden in confirm phase.
  assert.ok(!$("confirmPost").classList.contains("hidden"));
  assert.ok($("confirmDone").classList.contains("hidden"));
});

test("onPost fires with the items when Post is clicked", () => {
  const posted: unknown[] = [];
  const { modal, $ } = mount({ onPost: (items: never) => posted.push(items) });
  modal.open(ITEMS, ROWS);
  ($("confirmPost") as unknown as HTMLButtonElement).dispatchEvent(new win.Event("click"));
  assert.deepEqual(posted, [ITEMS]);
});

test("markRow flips per-row status and finish shows the summary", () => {
  const { modal, $ } = mount();
  modal.open(ITEMS, ROWS);
  modal.startPosting();
  modal.markRow("s1", true);
  modal.markRow("s2", false, "HTTP 403");
  modal.finish(1, 1);

  const list = $("confirmList");
  const s1 = list.querySelector('[data-sys-id="s1"]') as unknown as HTMLElement;
  const s2 = list.querySelector('[data-sys-id="s2"]') as unknown as HTMLElement;
  assert.equal(s1.dataset.status, "ok");
  assert.equal(s2.dataset.status, "failed");
  assert.match(s2.textContent || "", /HTTP 403/);
  assert.match($("confirmSummary").textContent || "", /1 succeeded/);
  assert.match($("confirmSummary").textContent || "", /1 failed/);
  // Retry + Done shown when there are failures.
  assert.ok(!$("retryFailedBtn").classList.contains("hidden"));
  assert.ok(!$("confirmDone").classList.contains("hidden"));
});

test("retry fires onRetry with ONLY the failed items", () => {
  const retried: unknown[] = [];
  const { modal, $ } = mount({ onRetry: (items: never) => retried.push(items) });
  modal.open(ITEMS, ROWS);
  modal.startPosting();
  modal.markRow("s1", true);
  modal.markRow("s2", false, "boom");
  modal.finish(1, 1);
  ($("retryFailedBtn") as unknown as HTMLButtonElement).dispatchEvent(new win.Event("click"));
  assert.equal(retried.length, 1);
  assert.deepEqual(retried[0], [ITEMS[1]]); // only s2
});

test("finish with no failures hides Retry and shows Done only", () => {
  const { modal, $ } = mount();
  modal.open(ITEMS, ROWS);
  modal.startPosting();
  modal.markRow("s1", true);
  modal.markRow("s2", true);
  modal.finish(2, 0);
  assert.ok($("retryFailedBtn").classList.contains("hidden"));
  assert.ok(!$("confirmDone").classList.contains("hidden"));
});
