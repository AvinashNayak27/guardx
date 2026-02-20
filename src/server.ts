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
import { attestResponse } from "./attest.js";
import { analyzeImage } from "./analysis.js";
import { chatWithAgent } from "./chat.js";
import { resolveAppToImageRef } from "./contracts.js";

const app = express();
const PORT = process.env.PORT ?? 3000;

app.use(cors({ origin: true }));
app.use(express.json());

app.get("/analysis/by-app/:network/:appId", async (req, res) => {
  const { network, appId } = req.params;

  const resolved = await resolveAppToImageRef(network, appId);
  if ("error" in resolved) {
    const status =
      resolved.error.includes("Unknown network") ||
      resolved.error.includes("Chain not configured")
        ? 400
        : 404;
    return res.status(status).json({ error: resolved.error });
  }

  const result = await analyzeImage(resolved.imageRef, "latest");

  if ("error" in result) {
    const status = result.error.includes("OPENAI_API_KEY")
      ? 500
      : result.error.includes("No layers match") || result.error.includes("No readable")
        ? 404
        : 500;
    return res.status(status).json({ error: result.error });
  }

  const attestation = await attestResponse("analysis", {
    image: result.image,
    digest: result.exploreDigest ?? undefined,
    content: JSON.stringify(result.analysis),
  });

  const response = {
    analysis: result.analysis,
    image: result.image,
    rawResponse: result.rawResponse,
    metadata: {
      timestamp: new Date().toISOString(),
      exploreDigest: result.exploreDigest ?? null,
      attestation,
      resolvedImageRef: resolved.imageRef,
    },
  };
  res.json(response);
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
    const status = result.error.includes("OPENAI_API_KEY")
      ? 500
      : result.error.includes("No layers match") || result.error.includes("No readable")
        ? 404
        : 500;
    return res.status(status).json({ error: result.error });
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

app.listen(PORT, () => {
  console.log(`Guardx server running at http://localhost:${PORT}`);
  console.log(`  GET  /analysis/by-app/:network/:appId - AI security audit by Eigen app`);
  console.log(`  POST /chat/by-app/:network/:appId     - chat with AI about app code`);
  console.log(`  GET  /health                          - health check`);
});
