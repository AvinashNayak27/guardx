/**
 * AI-powered layer selection - analyzes Docker manifest to pick the layer
 * containing application code.
 */

import { eigen } from "@layr-labs/ai-gateway-provider";
import { generateText, Output } from "ai";
import type { ImageConfig } from "./types.js";
import type { LayerInfo } from "./layers.js";

const MANIFEST_ANALYSIS_PROMPT = `You are an expert at analyzing Docker image manifests. Given a Docker image's layer metadata and config, determine which layer (by 1-based index) contains the application source code that will be executed at runtime.

Consider:
- CMD and Entrypoint: what command runs the app (e.g., "bun src/main.ts", "node dist/index.js")?
- created_by strings: each layer has a Dockerfile instruction (COPY, RUN, etc.). The app code layer is usually from COPY, or from a build step that outputs compiled code.
- WorkingDir: where the app runs from.
- Layer order: base layers (install deps) come first; app code is typically in later layers.

Pick the layer that contains the actual application JavaScript/TypeScript/source files that get run. If multiple layers could apply, prefer the one most likely to have the final built or source code.`;

export interface LayerSelectionInput {
  layers: LayerInfo[];
  createdBy: (string | undefined)[];
  config: {
    Cmd?: string[];
    Entrypoint?: string[];
    WorkingDir?: string;
  };
}

export interface LayerSelectionResult {
  layerIndex: number;
  reasoning?: string;
}

export async function selectLayerWithAI(
  input: LayerSelectionInput
): Promise<LayerSelectionResult | { error: string }> {
  const manifestSummary = {
    layers: input.layers.map((l, i) => ({
      index: l.index,
      digest: l.digest,
      size: l.size,
      created_by: input.createdBy[i] ?? "(unknown)",
    })),
    config: input.config,
  };

  const model = "openai/gpt-4o";
  console.error(`[layer-selector] Calling ${model} with ${input.layers.length} layers`);

  try {
    const prompt = `${MANIFEST_ANALYSIS_PROMPT}

Analyze this Docker manifest and select the app layer:

${JSON.stringify(manifestSummary, null, 2)}

Return valid JSON only with this shape:
{"layerIndex": number, "reasoning": "brief explanation"}`;
    const { output } = await generateText({
      model: eigen(model),
      output: Output.json(),
      prompt,
    });

    if (!output || typeof output !== "object" || Array.isArray(output)) {
      return { error: "AI returned invalid JSON for layer selection" };
    }
    const args = output as { layerIndex?: number | string; reasoning?: string };

    const layerIndex = typeof args.layerIndex === "number" ? args.layerIndex : parseInt(String(args.layerIndex), 10);
    if (isNaN(layerIndex) || layerIndex < 1 || layerIndex > input.layers.length) {
      return {
        error: `AI returned invalid layer index ${args.layerIndex} (must be 1-${input.layers.length})`,
      };
    }

    const reasoning = typeof args.reasoning === "string" ? args.reasoning : undefined;
    if (reasoning) {
      console.error(`[layer-selector] AI reasoning: ${reasoning}`);
    }
    console.error(`[layer-selector] Selected layer ${layerIndex}`);
    return {
      layerIndex,
      reasoning,
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return { error: `Layer selection failed: ${message}` };
  }
}
