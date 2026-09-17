import { STORAGE } from "../lib/keys.ts";
import { $ } from "./core.ts";

export type CiGroup = { name: string; items: string[] };
export type CiSplit = { enabled: boolean; groups: CiGroup[] };
export type ReportChoices = { opCo: string; domain: string };

let ciSplit: CiSplit = { enabled: false, groups: [] };
let reportChoices: ReportChoices = { opCo: "", domain: "" };
let savedMapPresent = false;
let onConfigChange: () => void = () => {};

const getCiSplit = (): CiSplit => ciSplit;

const getReportChoices = (): ReportChoices => reportChoices;

function setReportChoices(v: unknown): void {
  const src = (v && typeof v === "object" ? v : {}) as Record<string, unknown>;
  reportChoices = {
    opCo: typeof src.opCo === "string" ? src.opCo : "",
    domain: typeof src.domain === "string" ? src.domain : ""
  };
}

function normalizeGroups(groups: unknown[]): CiGroup[] {
  return groups
    .filter((g) => g && typeof g === "object")
    .map((g) => ({
      name: String((g as Record<string, unknown>).name ?? ""),
      items: Array.isArray((g as Record<string, unknown>).items)
        ? (((g as Record<string, unknown>).items as unknown[]).filter(
            (x) => typeof x === "string" && x.trim()
          ) as string[])
        : []
    }));
}

function setCiSplit(v: unknown) {
  const src = (v && typeof v === "object" ? v : {}) as Record<string, unknown>;
  ciSplit = {
    enabled: !!src.enabled,
    groups: Array.isArray(src.groups) ? normalizeGroups(src.groups as unknown[]) : []
  };
}

const getSavedMapPresent = (): boolean => savedMapPresent;
const setSavedMapPresent = (v: unknown): void => {
  savedMapPresent = !!v;
};

const setOnConfigChange = (fn: (() => void) | null): void => {
  onConfigChange = fn || (() => {});
};
const notifyConfigChange = (): void => onConfigChange();

function syncSplitRadio() {
  const active = ciSplit.enabled && ciSplit.groups.length;
  $("radSingle").checked = !active;
  $("radSplit").checked = !!active;
  notifyConfigChange();
}

function closeConfigDialog() {
  $("configModal").classList.add("hidden");
}

const updateExportDots = (): void => notifyConfigChange();
const updateCiBtn = (): void => notifyConfigChange();

chrome.storage.local.get([STORAGE.ciSplit], ({ ciSplit: cs }: { ciSplit?: unknown }) => {
  if (cs && typeof cs === "object") {
    const c = cs as Record<string, unknown>;
    if (Array.isArray(c.groups)) {
      ciSplit = {
        enabled: !!c.enabled,
        groups: normalizeGroups(c.groups as unknown[])
      };
    } else if (Array.isArray(c.items)) {
      ciSplit = {
        enabled: !!c.enabled,
        groups: (c.items as unknown[])
          .filter((x) => typeof x === "string" && x.trim())
          .map((ci) => ({ name: ci as string, items: [ci as string] }))
      };
    }
    syncSplitRadio();
  }
});

chrome.storage.local.get([STORAGE.exportColMap], ({ exportColMap }: { exportColMap?: unknown }) => {
  savedMapPresent = !!(
    exportColMap &&
    typeof exportColMap === "object" &&
    Object.keys(exportColMap as object).length
  );
  notifyConfigChange();
});

chrome.storage.local.get(
  [STORAGE.reportChoices],
  ({ reportChoices: rc }: { reportChoices?: unknown }) => {
    if (rc && typeof rc === "object") {
      setReportChoices(rc);
      notifyConfigChange();
    }
  }
);

export {
  getCiSplit,
  setCiSplit,
  getReportChoices,
  setReportChoices,
  getSavedMapPresent,
  setSavedMapPresent,
  setOnConfigChange,
  syncSplitRadio,
  closeConfigDialog,
  updateCiBtn,
  updateExportDots
};
