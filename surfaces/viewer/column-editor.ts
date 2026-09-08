import { $, COLUMNS, columnOptionList, visibleCols } from "./core.ts";
import type { ViewerRow } from "./core.ts";
import {
  addCellFocusListener,
  attentionCtx,
  findRowBySysId,
  fmtInstant,
  parseLocalInput,
  render,
  scheduleSave,
  updateGridRows
} from "./grid.ts";
import { currentRows } from "./grid-data.ts";
import { columnEntries, focusedIndexOf } from "./column-editor-data.ts";
import { getEditMode, setEditMode } from "./edit-mode-state.ts";
import { getCalclensMode } from "./calclens-state.ts";
import { isHighlightEnabled } from "./calclens-highlights.ts";
import { timelinePaneEl } from "./activity.ts";
import { computeAttention, flagsForColumn } from "../../core/attention.ts";
import { ColumnEditor } from "../../components/column-editor.ts";
import type { ColumnFlag } from "../../components/column-editor.ts";
import { iconize } from "../../lib/icons.ts";

let editor: ColumnEditor | null = null;

const DERIVED_KEYS = new Set([
  "assignTimeUtcIso", "acknTimeUtcIso", "suspendTimeUtcIso", "resumeTimeUtcIso"
]);

function colMeta(key: string): { label: string; cls: string } {
  const c = COLUMNS.find((x) => x[0] === key);
  return { label: c ? c[1] : key, cls: c ? c[2] : "" };
}

function isDerived(key: string): boolean {
  return DERIVED_KEYS.has(key) || colMeta(key).cls === "inst" || colMeta(key).cls === "rep" || colMeta(key).cls === "dur";
}

function flagsFor(sysId: string, key: string): ColumnFlag[] {
  if (!getCalclensMode()) return [];
  const row = findRowBySysId(sysId);
  if (!row) return [];
  const { teamMembers, groupScope } = attentionCtx();
  const flags = computeAttention(row, { teamMembers, groupScope });
  return flagsForColumn(flags, key)
    .filter((f) => isHighlightEnabled(f.id))
    .map((f) => ({ label: f.label }));
}

function openFor(key: string, focusSysId: string): void {
  if (!editor) return;
  const rows = currentRows();
  const entries = columnEntries(rows, key);
  if (!entries.length) return;
  const { label, cls } = colMeta(key);
  const focusIdx = Math.max(0, focusedIndexOf(entries, focusSysId));
  editor.show({ colKey: key, colLabel: label, cls, entries, focusIdx });
}

export function initColumnEditor(): void {
  const btn = $("editModeBtn");
  if (!btn) return;
  btn.textContent = "Edit column";
  iconize(btn, "square-pen");

  const reflect = (on: boolean): void => {
    btn.classList.toggle("edit-on", on);
    btn.setAttribute("data-tip", on
      ? "Edit mode ON — click a cell to bulk-edit that column. Click to turn off."
      : "Edit mode OFF — turn on, then click a cell to bulk-edit that column across the current view.");
  };

  const host = $("columnEditorModal");
  if (host) {
    editor = new ColumnEditor(host, {}, {
      activityFor: (sysId) => {
        const row = findRowBySysId(sysId);
        return row ? timelinePaneEl(row as ViewerRow) : null;
      },
      displayFor: (key, sysId, cls) => {
        const row = findRowBySysId(sysId);
        if (!row) return "";
        return cls === "inst" ? fmtInstant(String(row[key] ?? ""), row) : String(row[key] ?? "");
      },
      optionsFor: (key, sysId) => {
        const row = findRowBySysId(sysId);
        return row ? columnOptionList(key, row) : null;
      },
      parseValue: (v) => parseLocalInput(v),
      onCommit: (sysId, key, value) => {
        const row = findRowBySysId(sysId);
        if (!row) return;
        row[key] = value;
        scheduleSave();
        updateGridRows([sysId]);
        render();
      },
      onFocusRow: () => { /* left pane refresh handled by the component patch */ },
      flagsFor,
      isDerived
    });
  }

  btn.addEventListener("click", () => {
    const next = !getEditMode();
    setEditMode(next);
    reflect(next);
    if (!next && editor) editor.close();
  });

  reflect(getEditMode());

  addCellFocusListener((info) => {
    if (!getEditMode() || !info) return;
    const cols = visibleCols();
    if (!cols.some((c) => c[0] === info.key)) return;
    openFor(info.key, info.sysId);
  });
}

/** Close the editor if it is open (used when data is cleared/reloaded). */
export function closeColumnEditor(): void {
  if (editor && editor.isOpen()) editor.close();
}

/** Test hook. */
export function getColumnEditor(): ColumnEditor | null {
  return editor;
}
