/**
 * Parse CMD/Entrypoint to extract the entry script path.
 * Supports: node, bun, tsx, ts-node, python, go run, and similar runtimes.
 */

import type { ImageConfig } from "./types.js";

const SCRIPT_EXTENSIONS = /\.(ts|tsx|js|mjs|cjs|jsx|py|go)$/;

/**
 * Get the combined command (Entrypoint + Cmd) from image config.
 */
export function getEffectiveCommand(config: ImageConfig): string[] {
  const cfg = config.config ?? config.Config ?? {};
  const entrypoint = cfg.Entrypoint;
  const cmd = cfg.Cmd ?? [];
  const entrypointArr = Array.isArray(entrypoint)
    ? entrypoint
    : typeof entrypoint === "string"
      ? [entrypoint]
      : [];
  if (entrypointArr.length > 0) {
    return [...entrypointArr, ...cmd];
  }
  return cmd;
}

/**
 * Extract the entry script path from CMD/Entrypoint.
 * e.g. CMD ["bun", "src/main.ts"] -> "src/main.ts"
 * e.g. CMD ["node", "dist/index.js"] -> "dist/index.js"
 * Returns path relative to tar root (workdir-prefixed when WORKDIR is set).
 */
export function getEntryPathFromCmd(
  config: ImageConfig,
  workdir?: string
): string | null {
  const cmd = getEffectiveCommand(config);
  if (cmd.length === 0) return null;

  // Find the last argument that looks like a script path
  let scriptPath: string | null = null;
  for (let i = cmd.length - 1; i >= 0; i--) {
    const arg = cmd[i];
    if (!arg || arg.startsWith("-")) continue;
    // Explicit extension
    if (SCRIPT_EXTENSIONS.test(arg)) {
      scriptPath = arg;
      break;
    }
    // Path-like (contains / or looks like a file without extension)
    if (arg.includes("/") || !/^[a-z-]+$/i.test(arg)) {
      scriptPath = arg;
      break;
    }
  }

  if (!scriptPath) return null;

  // Normalize: remove leading ./
  scriptPath = scriptPath.replace(/^\.\/+/, "");

  // Prefix with workdir for tar path (e.g. WORKDIR /app, script src/main.ts -> app/src/main.ts)
  if (workdir && workdir.length > 0) {
    const wd = workdir.replace(/\/+$/, "");
    return `${wd}/${scriptPath}`;
  }
  return scriptPath;
}
