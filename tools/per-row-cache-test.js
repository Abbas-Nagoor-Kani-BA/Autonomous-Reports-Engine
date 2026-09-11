import { test } from "node:test";
import assert from "node:assert/strict";

import { hashNotes, alreadyClassified, classificationListsFp } from "../surfaces/viewer/classify.ts";

test("hashNotes is deterministic and sensitive to the note text", () => {
  assert.equal(hashNotes("Restarted the server"), hashNotes("Restarted the server"));
  assert.notEqual(hashNotes("Restarted the server"), hashNotes("Restarted the server now"));
});

test("alreadyClassified is true only when both fields are real MSR values AND notes unchanged", () => {
  const notes = "Disk failure, replaced the drive.";
  const h = hashNotes(notes);
  const inc = { number: "INC001" };
  assert.equal(alreadyClassified({ ...inc, rootCause: "Hardware", solutionType: "Workaround solution", notesHash: h }, notes), true);
  // Missing one field -> not fully classified.
  assert.equal(alreadyClassified({ ...inc, rootCause: "Hardware", solutionType: "", notesHash: h }, notes), false);
  // note changed -> must re-classify.
  assert.equal(alreadyClassified({ ...inc, rootCause: "Hardware", solutionType: "Workaround solution", notesHash: hashNotes("Different note") }, notes), false);
  // No recorded baseline -> assume it may have changed.
  assert.equal(alreadyClassified({ ...inc, rootCause: "Hardware", solutionType: "Workaround solution" }, notes), false);
  // Free-text root-cause analysis is NOT a valid category -> needs re-classification.
  assert.equal(alreadyClassified({ ...inc, rootCause: "Drive failed after prolonged use" , solutionType: "Workaround solution", notesHash: h }, notes), false);
});

test("alreadyClassified respects the classification context (model / list change)", () => {
  const notes = "Disk failure, replaced the drive.";
  const h = hashNotes(notes);
  const inc = { number: "INC001" };
  const row = { ...inc, rootCause: "Hardware", solutionType: "Workaround solution", notesHash: h, __classFp: "m1::l1" };
  assert.equal(alreadyClassified(row, notes, "m1::l1"), true, "same context + unchanged note -> kept");
  assert.equal(alreadyClassified(row, notes, "m2::l1"), false, "model changed -> re-classify");
  assert.equal(alreadyClassified(row, notes, "m1::l2"), false, "lists changed -> re-classify");
  assert.equal(alreadyClassified({ ...row, __classFp: undefined }, notes, "m1::l1"), false, "no recorded context -> re-classify");
});

test("classificationListsFp changes when the MSR lists change", () => {
  const lists = {
    rootCause: { Incident: ["Hardware", "Network issue"], RFS: [], P_Ticket: [] },
    resolution: ["Workaround solution"]
  };
  const changed = {
    rootCause: { Incident: ["Hardware", "Network issue", "Firewall"], RFS: [], P_Ticket: [] },
    resolution: ["Workaround solution"]
  };
  assert.notEqual(classificationListsFp(lists), classificationListsFp(changed), "a list edit changes the fp");
  assert.equal(classificationListsFp(lists), classificationListsFp({ ...lists }), "same lists -> same fp");
});

test("degraded (model-missing) rows re-run once the model is available", () => {
  // The degrade path stamps a distinct "degraded::<fp>" so a later real ML run,
  // which checks the plain fp, sees a mismatch and re-processes the row.
  const notes = "Disk failure, replaced the drive.";
  const h = hashNotes(notes);
  const inc = { number: "INC001" };
  const mlFp = "ml-model::ml::lists1";
  const degradedRow = {
    ...inc,
    rootCause: "Hardware",
    solutionType: "Workaround solution",
    notesHash: h,
    __classFp: `degraded::${mlFp}`
  };
  // Idempotent while still degraded (same degraded fp) -> skipped.
  assert.equal(alreadyClassified(degradedRow, notes, `degraded::${mlFp}`), true);
  // But under the real ML fp the context differs -> must re-run.
  assert.equal(alreadyClassified(degradedRow, notes, mlFp), false);
});

test("a model switch forces a re-run of an ML-classified row", () => {
  const notes = "Certificate expired on the gateway.";
  const h = hashNotes(notes);
  const inc = { number: "INC002" };
  const row = {
    ...inc,
    rootCause: "Certificate expiry",
    solutionType: "Permanent solution",
    notesHash: h,
    __classFp: "mobilebert::ml::lists1"
  };
  assert.equal(alreadyClassified(row, notes, "mobilebert::ml::lists1"), true, "same model -> steady state, skip");
  assert.equal(alreadyClassified(row, notes, "distilbert::ml::lists1"), false, "switched model -> re-run");
  assert.equal(alreadyClassified(row, notes, "mobilebert::hybrid::lists1"), false, "switched mode -> re-run");
});
