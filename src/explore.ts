/**
 * Reusable explore logic - returns JSON result for a given image ref.
 * Uses AI to select the app layer.
 */

import {
  resolveToImageManifest,
  fetchLayerBlob,
  parseImageRef,
} from "./registry.js";
import { extractLayers } from "./layers.js";
import {
  listLayerContents,
  findJsFilesInWorkdir,
  findCodeFilesInWorkdir,
  findCodeFilesFromEntry,
  extractFilesContent,
  tryDecodeAsText,
  normalizeTarPath,
} from "./layer-contents.js";
import {
  getAllLayersCreatedBy,
  getImageCmd,
  getWorkingDir,
  formatCmd,
} from "./config.js";
import { getEntryPathFromCmd } from "./cmd-utils.js";
import { selectLayerWithAI } from "./layer-selector.js";
import type { ImageConfig } from "./types.js";
import type { TarEntry } from "./layer-contents.js";

export interface ExploreResult {
  image: string;
  layer: number;
  createdBy: string | null;
  imageCmd: string | null;
  entryCount: number;
  entries: TarEntry[];
  digest: string;
  size: number;
  sizeFormatted: string;
  jsFiles: string[];
  concatenatedJsContent: string;
}

/**
 * Explore image, select app layer via AI, return its contents as JSON.
 */
export async function getExploreResult(
  imageRef: string,
  tag: string = "latest"
): Promise<ExploreResult | { error: string }> {
  try {
    const fullRef = imageRef.includes(":") ? imageRef : `${imageRef}:${tag}`;
    const parsed = parseImageRef(fullRef);

    const manifest = await resolveToImageManifest(parsed);
    const layers = extractLayers(manifest);
    const configBlob = await fetchLayerBlob(parsed, manifest.config.digest);
    const config = JSON.parse(
      new TextDecoder().decode(configBlob)
    ) as ImageConfig;

    const createdByList = getAllLayersCreatedBy(config, layers.length);

    console.error("[explore] Calling AI for layer selection...");
    const cfg = config.config ?? config.Config;
    const selection = await selectLayerWithAI({
      layers,
      createdBy: createdByList,
      config: {
        Cmd: cfg?.Cmd,
        Entrypoint: cfg?.Entrypoint,
        WorkingDir: cfg?.WorkingDir,
      },
    });
    if ("error" in selection) return { error: selection.error };
    const layerIndex = selection.layerIndex;
    console.error(`[explore] AI selected layer ${layerIndex}`);

    const layerInfo = layers[layerIndex - 1];
    if (!layerInfo) {
      return { error: `Invalid layer index ${layerIndex}` };
    }

    console.error(`[explore] Fetching layer ${layerInfo.index} (${layerInfo.sizeFormatted})...`);
    const layerBlob = await fetchLayerBlob(parsed, layerInfo.digest);
    const entries = await listLayerContents(layerBlob);
    const createdBy = createdByList[layerInfo.index - 1];
    const imageCmd = formatCmd(getImageCmd(config));
    const workdir = getWorkingDir(config);

    const entryPath = getEntryPathFromCmd(config, workdir);
    let paths: string[];
    if (entryPath) {
      console.error(`[explore] Entry path from CMD: ${entryPath}`);
      paths = await findCodeFilesFromEntry(layerBlob, entries, workdir, entryPath);
      console.error(`[explore] Found ${paths.length} code file(s) (entry + imports)`);
    } else {
      console.error("[explore] No entry path in CMD, scanning workdir for code files");
      const codeFiles = findCodeFilesInWorkdir(entries, workdir);
      if (codeFiles.length === 0) {
        const jsFiles = findJsFilesInWorkdir(entries, workdir);
        paths = jsFiles.map((f) => f.path).sort();
        console.error(`[explore] Fallback: found ${paths.length} .js file(s) in workdir`);
      } else {
        paths = codeFiles.map((f) => f.path).sort();
        console.error(`[explore] Found ${paths.length} code file(s) in workdir`);
      }
    }

    console.error(`[explore] Extracting content from ${paths.length} file(s): [${paths.slice(0, 3).join(", ")}${paths.length > 3 ? "..." : ""}]`);
    const contents = await extractFilesContent(layerBlob, paths);
    console.error(`[explore] Extracted ${contents.size} file(s), total ${[...contents.values()].reduce((sum, b) => sum + b.length, 0)} bytes`);
    const concatenated = paths
      .map((p) => {
        const buf = contents.get(normalizeTarPath(p)) ?? contents.get(p);
        return buf ? tryDecodeAsText(buf) : null;
      })
      .filter((t): t is string => t !== null)
      .join("\n\n");

    if (paths.length > 0 && concatenated.length === 0) {
      console.error(
        `[explore] Warning: extracted 0 bytes from ${paths.length} path(s). ` +
          `Map keys: [${[...contents.keys()].join(", ")}]. Requested: [${paths.slice(0, 5).join(", ")}${paths.length > 5 ? "..." : ""}]`
      );
    }

    console.error(`[explore] Done. Concatenated ${concatenated.length} chars`);
    return {
      image: fullRef,
      layer: layerInfo.index,
      createdBy: createdBy ?? null,
      imageCmd: imageCmd || null,
      entryCount: entries.length,
      entries,
      digest: layerInfo.digest,
      size: layerInfo.size,
      sizeFormatted: layerInfo.sizeFormatted,
      jsFiles: paths,
      concatenatedJsContent: concatenated || "(no readable code files)",
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return { error: message };
  }
}
