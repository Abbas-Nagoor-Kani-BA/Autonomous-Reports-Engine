import { normalizeNames } from "../summary/names.ts";

/*
 * Pure shaping for the opt-in "Resolve members & queues" button.
 *
 * The button issues Table API reads (sys_user_grmember / sys_user_group /
 * sys_user) in the service worker and hands the raw rows here to be turned into
 * plain name lists that merge into the settings chip lists. Nothing in this
 * module touches the network — it is a set of field extractors so the shaping
 * rules can be unit-tested against fixtures without a live instance.
 *
 * Table API rows are fetched with `sysparm_display_value=all`, so reference
 * fields arrive as `{ display_value, value }` objects. `active` may arrive as a
 * boolean, the string "true"/"false", or a display/value pair — every form is
 * accepted.
 */

export type SnCell = string | number | boolean | null | undefined | { display_value?: unknown; value?: unknown };
export type SnRow = Record<string, SnCell>;

/** The display label of a reference/plain cell, trimmed. */
function displayOf(cell: SnCell): string {
  if (cell && typeof cell === "object") {
    const dv = (cell as { display_value?: unknown }).display_value;
    const v = (cell as { value?: unknown }).value;
    return String(dv ?? v ?? "").trim();
  }
  return String(cell ?? "").trim();
}

/** The raw value (sys_id for a reference) of a cell, trimmed. */
export function valueOf(cell: SnCell): string {
  if (cell && typeof cell === "object") {
    const v = (cell as { value?: unknown }).value;
    const dv = (cell as { display_value?: unknown }).display_value;
    return String(v ?? dv ?? "").trim();
  }
  return String(cell ?? "").trim();
}

/** True unless the row's `active` field is explicitly false/"false". */
export function isActive(row: SnRow): boolean {
  const cell = row.active;
  if (cell === undefined || cell === null) return true;
  const raw = typeof cell === "object" ? (cell as { value?: unknown }).value ?? (cell as { display_value?: unknown }).display_value : cell;
  if (raw === false) return false;
  const s = String(raw ?? "").trim().toLowerCase();
  if (s === "false" || s === "0" || s === "no") return false;
  return true;
}

/**
 * Group display names from sys_user_grmember rows joined against the group.
 *
 * grmember rows carry a `group` reference whose `display_value` is the group
 * name. Inactive groups (when the join surfaces `group.active`) are dropped.
 * Result is trimmed and de-duplicated case-insensitively.
 */
export function queuesFromGroupMemberships(rows: SnRow[] | null | undefined): string[] {
  const names: string[] = [];
  for (const row of rows || []) {
    if (!isActive(row)) continue;
    const name = displayOf((row as SnRow).group);
    if (name) names.push(name);
  }
  return normalizeNames(names);
}

/**
 * Group display names from sys_user_grmember rows fetched with the dot-walked
 * `group.name` field. Preferred over the `group` reference's display value,
 * which can be configured to something other than the group name on some
 * instances.
 */
export function queuesFromMembershipNames(rows: SnRow[] | null | undefined): string[] {
  const names: string[] = [];
  for (const row of rows || []) {
    const r = (row || {}) as Record<string, SnCell>;
    const name = displayOf(r["group.name"]) || displayOf(r.group);
    if (name) names.push(name);
  }
  return normalizeNames(names);
}

/**
 * Group display names straight from sys_user_group rows (their `name` field).
 * Used when the group set is resolved as full group records rather than
 * membership rows.
 */
export function queuesFromGroups(rows: SnRow[] | null | undefined): string[] {
  const names: string[] = [];
  for (const row of rows || []) {
    if (!isActive(row)) continue;
    const name = displayOf((row as SnRow).name);
    if (name) names.push(name);
  }
  return normalizeNames(names);
}

/**
 * Member full names from sys_user_grmember rows joined against the user.
 *
 * grmember rows carry a `user` reference whose `display_value` is the user's
 * full name. Inactive users (when the join surfaces `user.active` mapped onto
 * `active`) are dropped. Result is trimmed and de-duplicated
 * case-insensitively.
 */
export function membersFromGroupMemberships(rows: SnRow[] | null | undefined): string[] {
  const names: string[] = [];
  for (const row of rows || []) {
    if (!isActive(row)) continue;
    const name = displayOf((row as SnRow).user);
    if (name) names.push(name);
  }
  return normalizeNames(names);
}

/**
 * Member full names from sys_user_grmember rows fetched with the dot-walked
 * `user.name` (full name) and `user.active` fields.
 *
 * Using `user.name` avoids depending on how the `user` reference's display
 * column is configured — on some instances that column is the login/email
 * (`user_name`), which is NOT the full-name format the team-member list matches
 * against. Rows whose `user.active` is explicitly false are dropped.
 */
export function membersFromMembershipNames(rows: SnRow[] | null | undefined): string[] {
  const names: string[] = [];
  for (const row of rows || []) {
    const r = (row || {}) as Record<string, SnCell>;
    const activeCell = r["user.active"];
    if (activeCell !== undefined && !isActive({ active: activeCell })) continue;
    const name = displayOf(r["user.name"]) || displayOf(r.user);
    if (name) names.push(name);
  }
  return normalizeNames(names);
}

/**
 * Member full names from sys_user rows (their `name` field), dropping inactive
 * users. Used when members are resolved as full user records.
 */
export function membersFromUsers(rows: SnRow[] | null | undefined): string[] {
  const names: string[] = [];
  for (const row of rows || []) {
    if (!isActive(row)) continue;
    const name = displayOf((row as SnRow).name);
    if (name) names.push(name);
  }
  return normalizeNames(names);
}

/** Group sys_ids from sys_user_grmember rows (the `group` reference value). */
export function groupIdsFromMemberships(rows: SnRow[] | null | undefined): string[] {
  const ids: string[] = [];
  for (const row of rows || []) {
    if (!isActive(row)) continue;
    const id = valueOf((row as SnRow).group);
    if (id) ids.push(id);
  }
  return [...new Set(ids)];
}

/**
 * Configuration item display names from cmdb_ci rows.
 *
 * Rows are fetched with the dot-walked `name` field; the CI display value is
 * its name. Blank names are skipped and the result is de-duplicated
 * case-insensitively (matching the chip list's `normalizeNames` rule).
 */
export function cisFromRows(rows: SnRow[] | null | undefined): string[] {
  const names: string[] = [];
  for (const row of rows || []) {
    const r = (row || {}) as Record<string, SnCell>;
    const name = displayOf(r.name);
    if (name) names.push(name);
  }
  return normalizeNames(names);
}

/**
 * Merge freshly resolved names into an existing chip list, preserving the
 * existing order and appending only the new ones. De-duplication is
 * case-insensitive, matching the chip list's own `normalizeNames` rule, so the
 * merge is idempotent.
 */
export function mergeNames(existing: string[] | null | undefined, resolved: string[] | null | undefined): string[] {
  return normalizeNames([...(existing || []), ...(resolved || [])]);
}

/**
 * Sorts names A–Z, case-insensitively, using locale-aware comparison so
 * accented names collate naturally. Does not de-duplicate — pair with
 * `normalizeNames`/`mergeNames` first when needed.
 */
export function sortNames(names: string[] | null | undefined): string[] {
  return [...(names || [])].sort((a, b) => a.localeCompare(b, undefined, { sensitivity: "base" }));
}

/**
 * Merges resolved names into an existing list (de-duped, case-insensitive) and
 * returns the result sorted A–Z. Used by the Settings Resolve button so both
 * the queues and team-member lists come out alphabetical.
 */
export function mergeSortedNames(existing: string[] | null | undefined, resolved: string[] | null | undefined): string[] {
  return sortNames(mergeNames(existing, resolved));
}

/**
 * Returns the `candidates` that are NOT already present in `existing`,
 * compared case-insensitively (the same rule the chip list de-dupes by) and
 * de-duplicated. Used so the per-queue member picker only offers names the Team
 * members list does not already contain.
 */
export function subtractNames(candidates: string[] | null | undefined, existing: string[] | null | undefined): string[] {
  const have = new Set(normalizeNames(existing).map((n) => n.toLowerCase()));
  return normalizeNames(candidates).filter((n) => !have.has(n.toLowerCase()));
}
