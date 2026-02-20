/**
 * Extract and list contents of a Docker layer (gzipped tar)
 */

import { createGunzip } from "node:zlib";
import { Readable } from "node:stream";
import { extract } from "tar-stream";
import { traceImports } from "./import-tracer.js";

export interface TarEntry {
  path: string;
  type: "file" | "directory" | "symlink";
  size?: number;
}

/**
 * List all entries (files, directories) in a gzipped tar layer.
 */
export async function listLayerContents(
  gzippedBuffer: ArrayBuffer
): Promise<TarEntry[]> {
  const entries: TarEntry[] = [];

  return new Promise((resolve, reject) => {
    const extractStream = extract();

    extractStream.on("entry", (header, stream, next) => {
      const type =
        header.type === "directory"
          ? "directory"
          : header.type === "symlink"
            ? "symlink"
            : "file";
      entries.push({
        path: header.name,
        type,
        size: header.size,
      });
      stream.resume();
      next();
    });

    extractStream.on("finish", () => resolve(entries));
    extractStream.on("error", reject);

    const gzip = createGunzip();
    const input = Readable.from(Buffer.from(gzippedBuffer));

    input.pipe(gzip).pipe(extractStream);
  });
}

export function logLayerContents(
  entries: TarEntry[],
  options: { json?: boolean } = {}
): void {
  if (options.json) {
    console.log(JSON.stringify(entries, null, 2));
    return;
  }

  for (const entry of entries) {
    const typeChar = entry.type === "directory" ? "d" : entry.type === "symlink" ? "l" : "-";
    const sizeStr = entry.size !== undefined ? `  ${entry.size}` : "";
    console.log(`${typeChar} ${entry.path}${sizeStr}`);
  }
}

const CODE_EXTENSIONS = [".js", ".ts", ".mjs", ".cjs", ".tsx", ".jsx", ".py", ".go"];
const EXCLUDED_PREFIXES = ["root/", "temp/", "tmp/", "node_modules/", "vendor/"];

function isCodeFile(path: string): boolean {
  const lower = path.toLowerCase();
  return CODE_EXTENSIONS.some((ext) => lower.endsWith(ext));
}

function isExcluded(path: string): boolean {
  return EXCLUDED_PREFIXES.some((p) => path.startsWith(p));
}

/**
 * Find .js files in workdir, excluding root/, temp/, tmp/.
 */
export function findJsFilesInWorkdir(
  entries: TarEntry[],
  workdir?: string
): TarEntry[] {
  return entries.filter((e) => {
    if (e.type !== "file" || !e.path.toLowerCase().endsWith(".js")) return false;
    if (EXCLUDED_PREFIXES.some((p) => e.path.startsWith(p))) return false;
    if (workdir) {
      const prefix = workdir.replace(/\/+$/, "") + "/";
      return e.path.startsWith(prefix);
    }
    return true;
  });
}

/**
 * Find code files (.js, .ts, .mjs, .cjs, .tsx, .jsx) in workdir, excluding node_modules, root/, temp/, tmp/.
 */
export function findCodeFilesInWorkdir(
  entries: TarEntry[],
  workdir?: string
): TarEntry[] {
  return entries.filter((e) => {
    if (e.type !== "file" || !isCodeFile(e.path)) return false;
    if (isExcluded(e.path)) return false;
    if (workdir) {
      const prefix = workdir.replace(/\/+$/, "") + "/";
      return e.path.startsWith(prefix);
    }
    return true;
  });
}

/**
 * Find code files by tracing imports from the entry path.
 * Falls back to findCodeFilesInWorkdir if entry not found or tracing yields nothing.
 */
export async function findCodeFilesFromEntry(
  gzippedBuffer: ArrayBuffer,
  entries: TarEntry[],
  workdir: string | undefined,
  entryPath: string
): Promise<string[]> {
  const filePaths = new Set(
    entries
      .filter((e) => e.type === "file")
      .map((e) => normalizeTarPath(e.path))
  );
  const normalizedEntry = normalizeTarPath(entryPath);
  if (!filePaths.has(normalizedEntry)) {
    console.error(`[layer-contents] Entry ${normalizedEntry} not found in layer, falling back to workdir scan`);
    const fallback = findCodeFilesInWorkdir(entries, workdir);
    return fallback.map((f) => f.path).sort();
  }

  console.error(`[layer-contents] Tracing imports from ${normalizedEntry}`);
  const contentCache = new Map<string, string | null>();
  const extractFn = async (path: string): Promise<string | null> => {
    const normalized = normalizeTarPath(path);
    if (contentCache.has(normalized)) {
      return contentCache.get(normalized) ?? null;
    }
    if (!filePaths.has(normalized)) return null;
    try {
      console.error(`[layer-contents] extractFileContent for import trace: ${normalized}`);
      const buf = await extractFileContent(gzippedBuffer, normalized);
      const text = tryDecodeAsText(buf);
      contentCache.set(normalized, text);
      return text;
    } catch {
      contentCache.set(normalized, null);
      return null;
    }
  };

  const traced = await traceImports(normalizedEntry, extractFn);
  if (traced.length > 0) {
    console.error(`[layer-contents] Import trace found ${traced.length} file(s)`);
    return traced.sort();
  }

  console.error(`[layer-contents] Import trace yielded nothing, falling back to workdir scan`);
  const fallback = findCodeFilesInWorkdir(entries, workdir);
  return fallback.map((f) => f.path).sort();
}

/** Normalize tar path for matching (strip ./, trailing slashes). */
export function normalizeTarPath(name: string): string {
  return name.replace(/^\.\/+/, "").replace(/\/+$/, "");
}

/** Extract content of multiple files in a single pass through the tar. */
export async function extractFilesContent(
  gzippedBuffer: ArrayBuffer,
  targetPaths: string[]
): Promise<Map<string, Buffer>> {
  const normalized = new Set(
    targetPaths.map((p) => normalizeTarPath(p))
  );
  const results = new Map<string, Buffer>();
  const layerSizeMB = (gzippedBuffer.byteLength / 1024 / 1024).toFixed(2);
  console.error(`[layer-contents] extractFilesContent: streaming ${layerSizeMB} MB layer for ${targetPaths.length} path(s)`);

  return new Promise((resolve, reject) => {
    const extractStream = extract();
    let entryCount = 0;

    extractStream.on("entry", (header, stream, next) => {
      entryCount++;
      if (entryCount <= 3 || entryCount % 5000 === 0) {
        console.error(`[layer-contents] Scanning entry ${entryCount}...`);
      }
      const name = normalizeTarPath(header.name);
      if (normalized.has(name)) {
        const chunks: Buffer[] = [];
        stream.on("data", (chunk: Buffer) => chunks.push(chunk));
        stream.on("end", () => {
          const buf = Buffer.concat(chunks);
          results.set(name, buf);
          console.error(`[layer-contents] Extracted ${name} (${buf.length} bytes)`);
          next();
        });
        stream.on("error", reject);
      } else {
        stream.resume();
        next();
      }
    });

    extractStream.on("finish", () => {
      console.error(`[layer-contents] extractFilesContent done: ${results.size} file(s) matched`);
      resolve(results);
    });
    extractStream.on("error", reject);

    const gzip = createGunzip();
    const input = Readable.from(Buffer.from(gzippedBuffer));
    input.pipe(gzip).pipe(extractStream);
  });
}

/** Extract the raw content of a file from a gzipped tar layer by path. */
export async function extractFileContent(
  gzippedBuffer: ArrayBuffer,
  targetPath: string
): Promise<Buffer> {
  const chunks: Buffer[] = [];
  const normalizedTarget = normalizeTarPath(targetPath);

  return new Promise((resolve, reject) => {
    const extractStream = extract();

    extractStream.on("entry", (header, stream, next) => {
      const name = normalizeTarPath(header.name);
      if (name === normalizedTarget) {
        stream.on("data", (chunk: Buffer) => chunks.push(chunk));
        stream.on("end", () => {
          next();
        });
        stream.on("error", reject);
      } else {
        stream.resume();
        next();
      }
    });

    extractStream.on("finish", () => resolve(Buffer.concat(chunks)));
    extractStream.on("error", reject);

    const gzip = createGunzip();
    const input = Readable.from(Buffer.from(gzippedBuffer));
    input.pipe(gzip).pipe(extractStream);
  });
}

/** Try to decode buffer as UTF-8 text; return null if not valid text. */
export function tryDecodeAsText(buffer: Buffer): string | null {
  try {
    const text = buffer.toString("utf-8");
    if (/\0/.test(text)) return null;
    return text;
  } catch {
    return null;
  }
}

export async function logConcatenatedJsFiles(
  gzippedBuffer: ArrayBuffer,
  entries: TarEntry[],
  workdir?: string
): Promise<void> {
  const jsFiles = findJsFilesInWorkdir(entries, workdir);
  if (jsFiles.length === 0) return;

  const paths = jsFiles.map((f) => f.path).sort();
  const contents = await extractFilesContent(gzippedBuffer, paths);

  const parts: string[] = [];
  for (const path of paths) {
    const buf = contents.get(path);
    if (!buf) continue;
    const text = tryDecodeAsText(buf);
    if (text !== null) {
      parts.push(`// === ${path} ===\n${text}`);
    }
  }

  const combined = parts.join("\n\n");
  if (combined) {
    console.log(
      `\n📄 Concatenated .js files from workdir (${jsFiles.length} file(s)):\n`
    );
    console.log("--- Content ---");
    console.log(combined);
    console.log("--- End ---\n");
  }
}
