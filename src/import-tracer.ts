/**
 * Trace imports from an entry file to collect all reachable source files.
 * Supports: JS/TS (import/require), Python (from/import), Go (import).
 */

const MAX_DEPTH = 50;

// JS/TS: from 'path', require('path'), import 'path'
const FROM_RE = /from\s+['"]([^'"]+)['"]/g;
const REQUIRE_RE = /require\s*\(\s*['"]([^'"]+)['"]\s*\)/g;
const SIDE_EFFECT_IMPORT_RE = /import\s+['"]([^'"]+)['"]/g;

// Python: from .utils import x, from ..pkg import x
const PYTHON_FROM_RE = /from\s+(\.+[.\w]*)\s+import/g;

// Go: import "./pkg", import ("path1" "path2") - match quoted paths starting with ./
const GO_IMPORT_RE = /"((?:\.\/|\.\.\/)[^"]*)"/g;

const CODE_EXTENSIONS = [".ts", ".tsx", ".js", ".mjs", ".cjs", ".jsx", ".py", ".go"];
const INDEX_NAMES = ["index.ts", "index.tsx", "index.js", "index.mjs", "index.cjs", "__init__.py"];

function isRelativePath(spec: string): boolean {
  return spec.startsWith("./") || spec.startsWith("../");
}

/**
 * Resolve a relative import path from a given file path.
 * e.g. from "app/src/main.ts", spec "./utils" -> "app/src/utils"
 */
function resolveRelative(
  fromPath: string,
  spec: string
): string[] {
  const dir = fromPath.includes("/") ? fromPath.replace(/\/[^/]+$/, "") : "";
  const parts = [...(dir ? dir.split("/") : []), ...spec.split("/")];
  const resolved: string[] = [];
  for (const p of parts) {
    if (p === ".") continue;
    if (p === "..") resolved.pop();
    else resolved.push(p);
  }
  const base = resolved.join("/");
  if (!base) return [];

  const candidates: string[] = [];
  // If spec already has extension, use it
  if (/\.(ts|tsx|js|mjs|cjs|jsx|py|go)$/.test(base)) {
    candidates.push(base);
  } else {
    for (const ext of CODE_EXTENSIONS) {
      candidates.push(`${base}${ext}`);
    }
    for (const idx of INDEX_NAMES) {
      candidates.push(`${base}/${idx}`);
    }
    // Go: package dir often has package_name.go
    const pkgName = base.split("/").pop();
    if (pkgName) {
      candidates.push(`${base}/${pkgName}.go`);
    }
  }
  return candidates;
}

/**
 * Convert Python relative module (e.g. .utils, ..pkg.mod) to path spec.
 */
function pythonModuleToPath(spec: string): string {
  const trimmed = spec.trim();
  if (!trimmed.startsWith(".")) return "";
  const match = trimmed.match(/^(\.+)(.*)$/);
  if (!match) return "";
  const dots = match[1];
  const rest = match[2].replace(/\./g, "/").replace(/\/+$/, "");
  const up = dots.length - 1;
  const prefix = up > 0 ? Array(up).fill("..").join("/") : ".";
  return rest ? `${prefix}/${rest}` : prefix;
}

/**
 * Extract relative import specs from file content.
 * Handles JS/TS, Python, and Go based on file extension.
 */
function extractRelativeImports(content: string, filePath: string): string[] {
  const specs: string[] = [];
  const ext = filePath.toLowerCase().split(".").pop() ?? "";

  if (["js", "ts", "mjs", "cjs", "tsx", "jsx"].includes(ext)) {
    const jsReList = [FROM_RE, REQUIRE_RE, SIDE_EFFECT_IMPORT_RE];
    for (const re of jsReList) {
      let m: RegExpExecArray | null;
      re.lastIndex = 0;
      while ((m = re.exec(content)) !== null) {
        const spec = m[1].trim();
        if (isRelativePath(spec)) specs.push(spec);
      }
    }
  } else if (ext === "py") {
    PYTHON_FROM_RE.lastIndex = 0;
    let pm: RegExpExecArray | null;
    while ((pm = PYTHON_FROM_RE.exec(content)) !== null) {
      const pathSpec = pythonModuleToPath(pm[1]);
      if (pathSpec) specs.push(pathSpec);
    }
  } else if (ext === "go") {
    GO_IMPORT_RE.lastIndex = 0;
    let gm: RegExpExecArray | null;
    while ((gm = GO_IMPORT_RE.exec(content)) !== null) {
      const path = gm[1]?.trim();
      if (path) specs.push(path);
    }
  }

  return [...new Set(specs)];
}

/**
 * Trace imports from entry path, returning all reachable file paths.
 * extractFn: (path: string) => Promise<string | null> - returns file content or null if not found
 */
export async function traceImports(
  entryPath: string,
  extractFn: (path: string) => Promise<string | null>,
  options: { maxDepth?: number } = {}
): Promise<string[]> {
  const maxDepth = options.maxDepth ?? MAX_DEPTH;
  const collected = new Set<string>();
  const queue: { path: string; depth: number }[] = [{ path: entryPath, depth: 0 }];

  while (queue.length > 0) {
    const { path, depth } = queue.shift()!;
    if (collected.has(path)) continue;
    if (depth > maxDepth) continue;

    collected.add(path);
    const content = await extractFn(path);
    if (!content) continue;

    const specs = extractRelativeImports(content, path);
    for (const spec of specs) {
      const candidates = resolveRelative(path, spec);
      for (const cand of candidates) {
        if (collected.has(cand)) break;
        const exists = await extractFn(cand);
        if (exists !== null) {
          queue.push({ path: cand, depth: depth + 1 });
          break;
        }
      }
    }
  }

  return Array.from(collected);
}
