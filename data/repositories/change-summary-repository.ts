import { STORAGE } from "../../lib/keys.ts";
import { KEY_VALUE_STORE } from "../../di/tokens.ts";
import type { KeyValueStore } from "../key-value-store.ts";
import type { ChangeSummaryWindows } from "../../core/summary/change-summary-filter.ts";

export interface ChangeSummaryRepository {
  load(): Promise<ChangeSummaryWindows | null>;
  save(w: ChangeSummaryWindows): Promise<void>;
  clear(): Promise<void>;
}

export class ChangeSummaryStore implements ChangeSummaryRepository {
  static readonly deps = [KEY_VALUE_STORE] as const;

  private readonly store: KeyValueStore;

  constructor(store: KeyValueStore) {
    this.store = store;
  }

  async load(): Promise<ChangeSummaryWindows | null> {
    const raw = await this.store.get<unknown>(STORAGE.changeSummaryFilter, null);
    if (!raw || typeof raw !== "object") return null;
    return raw as ChangeSummaryWindows;
  }

  save(w: ChangeSummaryWindows): Promise<void> {
    return this.store.set(STORAGE.changeSummaryFilter, w);
  }

  clear(): Promise<void> {
    return this.store.remove(STORAGE.changeSummaryFilter);
  }
}
