/**
 * Shared model selection for local OpenAI and deployed Eigen inference.
 */

import { openai } from "@ai-sdk/openai";
import { eigen } from "@layr-labs/ai-gateway-provider";
import type { LanguageModel } from "ai";

interface InferenceModelOptions {
  eigenModel: string;
  openaiModel?: string;
}

const DEFAULT_OPENAI_MODEL = "gpt-5.5";

export function useEigenInference(): boolean {
  return process.env.USE_EIGEN_INFERENCE?.toLowerCase() !== "false";
}

export function getInferenceModelName(options: InferenceModelOptions): string {
  return useEigenInference()
    ? options.eigenModel
    : (options.openaiModel ?? DEFAULT_OPENAI_MODEL);
}

export function getInferenceModel(options: InferenceModelOptions): LanguageModel {
  return useEigenInference()
    ? eigen(options.eigenModel)
    : openai(options.openaiModel ?? DEFAULT_OPENAI_MODEL);
}
