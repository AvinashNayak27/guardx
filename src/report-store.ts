/**
 * Filesystem-backed storage for analysis reports.
 */

import { mkdir, readFile, rename, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import type { AnalysisResult } from "./analysis.js";
import type { Attestation } from "./attest.js";

type ResolverSource = "api" | "chain";
type ReleaseMetadata = Record<string, unknown> | null;
type ReleaseChangeMetadata = Record<string, unknown> | null;

export interface StoredAnalysisReport {
  analysis: AnalysisResult;
  image: string;
  rawResponse?: string;
  metadata: {
    timestamp: string;
    exploreDigest: string | null;
    attestation: Attestation | null;
    resolvedImageRef: string;
    resolverSource: ResolverSource;
    latestRelease: ReleaseMetadata;
    previousRelease: ReleaseMetadata;
    releaseChangeLog: ReleaseChangeMetadata;
  };
}

export interface StoredAnalysisFailure {
  status: "failed";
  error: string;
  metadata: {
    timestamp: string;
    resolvedImageRef: string;
    resolverSource: ResolverSource;
    latestRelease: ReleaseMetadata;
    previousRelease: ReleaseMetadata;
    releaseChangeLog: ReleaseChangeMetadata;
  };
}

export interface ReportKey {
  network: string;
  appId: string;
  digest: string;
}

const REPORTS_DIR = process.env.REPORTS_DIR
  ? path.resolve(process.env.REPORTS_DIR)
  : path.join(process.cwd(), "data", "reports");

function normalizeSegment(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9._-]/g, "_");
}

function reportPath(key: ReportKey, suffix: "json" | "failure.json"): string {
  const digestSegment = normalizeSegment(key.digest);
  return path.join(
    REPORTS_DIR,
    normalizeSegment(key.network),
    normalizeSegment(key.appId),
    `${digestSegment}.${suffix}`,
  );
}

async function atomicWriteJson(filePath: string, value: unknown): Promise<void> {
  await mkdir(path.dirname(filePath), { recursive: true });
  const tmpPath = `${filePath}.${process.pid}.${Date.now()}.tmp`;
  await writeFile(tmpPath, `${JSON.stringify(value, null, 2)}\n`, "utf8");
  await rename(tmpPath, filePath);
}

async function readJson<T>(filePath: string): Promise<T | null> {
  try {
    return JSON.parse(await readFile(filePath, "utf8")) as T;
  } catch (err) {
    if (err instanceof Error && "code" in err && err.code === "ENOENT") {
      return null;
    }
    throw err;
  }
}

export function buildReportKey(
  network: string,
  appId: string,
  digest: string,
): ReportKey {
  return {
    network: network.toLowerCase(),
    appId: appId.toLowerCase(),
    digest,
  };
}

export function formatReportJobKey(key: ReportKey): string {
  return `${key.network}|${key.appId}|${key.digest}`;
}

export async function loadReport(
  key: ReportKey,
): Promise<StoredAnalysisReport | null> {
  return readJson<StoredAnalysisReport>(reportPath(key, "json"));
}

export async function saveReport(
  key: ReportKey,
  report: StoredAnalysisReport,
): Promise<void> {
  await atomicWriteJson(reportPath(key, "json"), report);
  await rm(reportPath(key, "failure.json"), { force: true });
}

export async function loadFailure(
  key: ReportKey,
): Promise<StoredAnalysisFailure | null> {
  return readJson<StoredAnalysisFailure>(reportPath(key, "failure.json"));
}

export async function saveFailure(
  key: ReportKey,
  failure: StoredAnalysisFailure,
): Promise<void> {
  await atomicWriteJson(reportPath(key, "failure.json"), failure);
}
