/**
 * Guardx API server - audit and chat by Eigen app ID only.
 *
 * Usage:
 *   npm run dev
 *   curl "http://localhost:3000/analysis/by-app/sepolia/0x954450e70556b56300aba48674f97adaaa8c463c"
 */

import "dotenv/config";
import cors from "cors";
import express from "express";
import { readFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { attestResponse } from "./attest.js";
import { analyzeImage } from "./analysis.js";
import { chatWithAgent } from "./chat.js";
import { resolveAppToImageRef } from "./contracts.js";
import {
  buildReportKey,
  formatReportJobKey,
  loadFailure,
  loadReport,
  saveFailure,
  saveReport,
  type ReportKey,
  type StoredAnalysisReport,
} from "./report-store.js";

const app = express();
const PORT = process.env.PORT ?? 3000;
const APP_ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const SKILL_FILE_PATH = join(APP_ROOT, "skills", "guardx", "SKILL.md");
const analysisJobs = new Map<string, Promise<void>>();
type ResolvedApp = Exclude<
  Awaited<ReturnType<typeof resolveAppToImageRef>>,
  { error: string }
>;

app.use(cors({ origin: true }));
app.use(express.json());

function resolveStatusCode(error: string): number {
  return error.includes("Unknown network") || error.includes("Chain not configured")
    ? 400
    : 404;
}

function analysisStatusCode(error: string): number {
  return error.includes("No layers match") || error.includes("No readable")
    ? 404
    : 500;
}

function buildStatusMetadata(resolved: ResolvedApp) {
  return {
    resolvedImageRef: resolved.imageRef,
    resolverSource: "chain" as const,
    latestRelease: null,
    previousRelease: null,
    releaseChangeLog: null,
  };
}

function buildReport(
  resolved: ResolvedApp,
  result: Exclude<Awaited<ReturnType<typeof analyzeImage>>, { error: string }>,
  attestation: Awaited<ReturnType<typeof attestResponse>>,
): StoredAnalysisReport {
  return {
    analysis: result.analysis,
    image: result.image,
    rawResponse: result.rawResponse,
    metadata: {
      timestamp: new Date().toISOString(),
      exploreDigest: result.exploreDigest ?? null,
      attestation,
      resolvedImageRef: resolved.imageRef,
      resolverSource: "chain",
      latestRelease: null,
      previousRelease: null,
      releaseChangeLog: null,
    },
  };
}

function startAnalysisJob(
  key: ReportKey,
  resolved: ResolvedApp,
): Promise<void> {
  const jobKey = formatReportJobKey(key);
  const existing = analysisJobs.get(jobKey);
  if (existing) return existing;

  const job = (async () => {
    const result = await analyzeImage(resolved.imageRef, "latest");

    if ("error" in result) {
      await saveFailure(key, {
        status: "failed",
        error: result.error,
        metadata: {
          timestamp: new Date().toISOString(),
          ...buildStatusMetadata(resolved),
        },
      });
      return;
    }

    const attestation = await attestResponse("analysis", {
      image: result.image,
      digest: result.exploreDigest ?? undefined,
      content: JSON.stringify(result.analysis),
    });

    await saveReport(key, buildReport(resolved, result, attestation));
  })()
    .catch(async (err) => {
      const message = err instanceof Error ? err.message : String(err);
      await saveFailure(key, {
        status: "failed",
        error: `Analysis failed: ${message}`,
        metadata: {
          timestamp: new Date().toISOString(),
          ...buildStatusMetadata(resolved),
        },
      });
    })
    .finally(() => {
      analysisJobs.delete(jobKey);
    });

  analysisJobs.set(jobKey, job);
  return job;
}

app.get("/analysis/by-app/:network/:appId/latest", async (req, res) => {
  const { network, appId } = req.params;

  const resolved = await resolveAppToImageRef(network, appId);
  if ("error" in resolved) {
    return res.status(resolveStatusCode(resolved.error)).json({ error: resolved.error });
  }

  const key = buildReportKey(network, appId, resolved.digest);
  const report = await loadReport(key);
  if (report) return res.json(report);

  const jobKey = formatReportJobKey(key);
  if (analysisJobs.has(jobKey)) {
    return res.status(202).json({
      status: "running",
      metadata: buildStatusMetadata(resolved),
    });
  }

  const failure = await loadFailure(key);
  if (failure) return res.json(failure);

  return res.status(202).json({
    status: "idle",
    metadata: buildStatusMetadata(resolved),
  });
});

app.post("/analysis/by-app/:network/:appId/refresh", async (req, res) => {
  const { network, appId } = req.params;

  const resolved = await resolveAppToImageRef(network, appId);
  if ("error" in resolved) {
    return res.status(resolveStatusCode(resolved.error)).json({ error: resolved.error });
  }

  const key = buildReportKey(network, appId, resolved.digest);
  const report = await loadReport(key);
  if (report) return res.json(report);

  startAnalysisJob(key, resolved);
  return res.status(202).json({
    status: "running",
    metadata: buildStatusMetadata(resolved),
  });
});

app.get("/analysis/by-app/:network/:appId", async (req, res) => {
  const { network, appId } = req.params;

  const resolved = await resolveAppToImageRef(network, appId);
  if ("error" in resolved) {
    return res.status(resolveStatusCode(resolved.error)).json({ error: resolved.error });
  }

  const key = buildReportKey(network, appId, resolved.digest);
  const report = await loadReport(key);
  if (report) return res.json(report);

  const jobKey = formatReportJobKey(key);
  if (analysisJobs.has(jobKey)) {
    return res.status(202).json({
      status: "running",
      metadata: buildStatusMetadata(resolved),
    });
  }

  const failure = await loadFailure(key);
  if (failure) return res.json(failure);

  return res.status(202).json({
    status: "idle",
    metadata: buildStatusMetadata(resolved),
  });
});

app.post("/chat/by-app/:network/:appId", async (req, res) => {
  const { network, appId } = req.params;
  const { message, history } = req.body as {
    message?: string;
    history?: Array<{ role: string; content: string }>;
  };

  if (!message || typeof message !== "string") {
    return res.status(400).json({ error: "Body must include message (string)" });
  }

  const resolved = await resolveAppToImageRef(network, appId);
  if ("error" in resolved) {
    const status =
      resolved.error.includes("Unknown network") ||
      resolved.error.includes("Chain not configured")
        ? 400
        : 404;
    return res.status(status).json({ error: resolved.error });
  }

  const normalizedHistory = Array.isArray(history)
    ? history
        .filter((m) => m && typeof m.role === "string" && typeof m.content === "string")
        .map((m) => ({ role: m.role as "user" | "assistant" | "system", content: m.content }))
    : [];

  const result = await chatWithAgent(
    resolved.imageRef,
    "latest",
    message,
    normalizedHistory
  );

  if ("error" in result) {
    return res.status(analysisStatusCode(result.error)).json({ error: result.error });
  }

  const attestation = await attestResponse("chat", {
    image: result.image,
    content: result.reply,
  });

  res.json({ ...result, attestation, resolvedImageRef: resolved.imageRef });
});

app.get("/health", (_req, res) => {
  res.status(200).send("OK");
});

app.get("/skill.md", async (_req, res) => {
  try {
    const skill = await readFile(SKILL_FILE_PATH, "utf8");
    res.type("text/markdown").send(skill);
  } catch {
    res.status(404).json({ error: "Guardx skill file not found" });
  }
});

app.listen(PORT, () => {
  console.log(`Guardx server running at http://localhost:${PORT}`);
  console.log(`  GET  /analysis/by-app/:network/:appId/latest  - latest stored security audit`);
  console.log(`  POST /analysis/by-app/:network/:appId/refresh - start security audit refresh`);
  console.log(`  POST /chat/by-app/:network/:appId     - chat with AI about app code`);
  console.log(`  GET  /skill.md                       - Guardx agent skill`);
  console.log(`  GET  /health                          - health check`);
});
