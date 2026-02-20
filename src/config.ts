/**
 * Image config parsing - extract layer creation commands and image CMD
 */

import type { ImageConfig, ImageConfigHistory } from "./types.js";

/**
 * Get the created_by (Dockerfile instruction) for a specific layer.
 * History entries with empty_layer: true don't correspond to filesystem layers.
 * Layers are 1-indexed; we find the Nth non-empty history entry.
 */
export function getLayerCreatedBy(
  config: ImageConfig,
  layerIndex: number
): string | undefined {
  const history = config.history ?? [];
  let layerCount = 0;
  for (const entry of history) {
    if (!entry.empty_layer) {
      layerCount++;
      if (layerCount === layerIndex) {
        return entry.created_by;
      }
    }
  }
  return undefined;
}

/**
 * Get created_by for all layers. Returns array where index i = created_by for layer i+1.
 */
export function getAllLayersCreatedBy(
  config: ImageConfig,
  layerCount: number
): (string | undefined)[] {
  const result: (string | undefined)[] = [];
  for (let i = 1; i <= layerCount; i++) {
    result.push(getLayerCreatedBy(config, i));
  }
  return result;
}

/**
 * Get the image's default CMD (container run command).
 */
export function getImageCmd(config: ImageConfig): string[] | undefined {
  const cfg = config.config ?? config.Config;
  return cfg?.Cmd;
}

/**
 * Format CMD array for display (e.g., ["node", "app.js"] -> "node app.js")
 */
export function formatCmd(cmd: string[] | undefined): string {
  if (!cmd || cmd.length === 0) return "";
  return cmd.join(" ");
}

/**
 * Get WORKDIR from config, normalized for tar paths (e.g., "/app" -> "app").
 */
export function getWorkingDir(config: ImageConfig): string | undefined {
  const cfg = config.config ?? config.Config;
  const wd = cfg?.WorkingDir;
  if (!wd) return undefined;
  return wd.replace(/^\/+/, "");
}
