import type { App, TFile } from "obsidian";

export const PLUGIN_ID = "trash-collection";
export const API_VERSION = 1 as const;

export interface TrashCollectionApi {
  readonly version: typeof API_VERSION;
  getCandidates(): TFile[];
  openTriage(): Promise<void>;
}

/**
 * Returns the trash-collection API if the plugin is loaded and version-compatible,
 * otherwise null. Safe to call even if the plugin isn't installed.
 */
export function getTrashCollectionApi(app: App): TrashCollectionApi | null {
  const plugin = (app as any).plugins?.plugins?.[PLUGIN_ID];
  if (!plugin?.api || plugin.api.version !== API_VERSION) return null;
  return plugin.api as TrashCollectionApi;
}
