/**
 * AI-powered layer selection - analyzes Docker manifest to pick the layer
 * containing application code. Requires OPENAI_API_KEY.
 */

import OpenAI from "openai";
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
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    return { error: "OPENAI_API_KEY is required for layer selection" };
  }

  const manifestSummary = {
    layers: input.layers.map((l, i) => ({
      index: l.index,
      digest: l.digest,
      size: l.size,
      created_by: input.createdBy[i] ?? "(unknown)",
    })),
    config: input.config,
  };

  const openai = new OpenAI({ apiKey });
  const model = process.env.OPENAI_MODEL ?? "gpt-4o";
  console.error(`[layer-selector] Calling ${model} with ${input.layers.length} layers`);

  const tools: OpenAI.Chat.ChatCompletionTool[] = [
    {
      type: "function",
      function: {
        name: "select_app_layer",
        description: "Select which layer index (1-based) contains the application source code",
        parameters: {
          type: "object",
          properties: {
            layerIndex: {
              type: "number",
              description: "1-based layer index",
            },
            reasoning: {
              type: "string",
              description: "Brief explanation",
            },
          },
          required: ["layerIndex"],
        },
      },
    },
  ];

  try {
    const completion = await openai.chat.completions.create({
      model,
      messages: [
        { role: "system", content: MANIFEST_ANALYSIS_PROMPT },
        {
          role: "user",
          content: `Analyze this Docker manifest and select the app layer:\n\n${JSON.stringify(manifestSummary, null, 2)}`,
        },
      ],
      tools,
      tool_choice: { type: "function", function: { name: "select_app_layer" } },
      temperature: 0.2,
    });

    const toolCall = completion.choices[0]?.message?.tool_calls?.[0];
    if (!toolCall || toolCall.function.name !== "select_app_layer") {
      return { error: "AI did not return layer selection" };
    }

    let args: { layerIndex?: number; reasoning?: string };
    try {
      args = JSON.parse(toolCall.function.arguments);
    } catch {
      return { error: "AI returned invalid JSON for layer selection" };
    }

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
