export const STORAGE = Object.freeze({
  pluginSettings: "pluginSettings",
  msrLists: "msrLists",
  lastData: "lastData",
  lastRun: "lastRun",
  viewerSel: "viewerSel",
  viewerHiddenCols: "viewerHiddenCols",
  viewerColWidths: "viewerColWidths",
  viewerColOrder: "viewerColOrder",
  calclensHighlights: "calclensHighlights",
  viewerActionRail: "viewerActionRail",
  exportColMap: "exportColMap",
  ciSplit: "ciSplit",
  reportChoices: "reportChoices",
  snXlsxTemplate: "snXlsxTemplate",
  snFilterList: "snFilterList",
  snFilterPresets: "snFilterPresets",
  includeSummary: "includeSummary",
  viewerSummaryNarrative: "viewerSummaryNarrative"
} as const);

export const MSG = Object.freeze({
  run: "RUN",
  count: "COUNT",
  ping: "PING",
  progress: "PROGRESS",
  dataUpdated: "DATA_UPDATED",
  snFetch: "SN_FETCH",
  resolveScope: "RESOLVE_SCOPE",
  resolveGroupMembers: "RESOLVE_GROUP_MEMBERS",
  resolveGroupCis: "RESOLVE_GROUP_CIS"
} as const);
