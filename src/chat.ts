/**
 * Chat agent for Q&A about Docker image code.
 */

import { eigen } from "@layr-labs/ai-gateway-provider";
import { generateText } from "ai";
import { getExploreResult } from "./explore.js";

export interface ChatMessage {
  role: "user" | "assistant" | "system";
  content: string;
}

export interface ChatResult {
  reply: string;
  image: string;
}

/**
 * Chat with the AI agent about a Docker image's application code.
 * Context is injected from the explore result (concatenated JS content).
 * Stateless: pass conversation history in each request.
 */
export async function chatWithAgent(
  imageRef: string,
  tag: string,
  message: string,
  history: ChatMessage[] = []
): Promise<ChatResult | { error: string }> {
  const exploreResult = await getExploreResult(imageRef, tag);
  if ("error" in exploreResult) {
    return { error: exploreResult.error };
  }

  const code = exploreResult.concatenatedJsContent;
  if (!code || code === "(no readable .js files)" || code === "(no readable code files)") {
    return { error: "No readable code found in layer" };
  }

  const systemPrompt = `You are an expert assistant that answers questions about application code. The user is asking about code extracted from Docker image ${exploreResult.image}.

Below is the concatenated code build output from the application. Answer questions based ONLY on this code. If the answer is not in the code, say so. Be concise and accurate.

--- Application Code ---

${code}

--- End of Code ---`;

  const model = "anthropic/claude-sonnet-4.6";
  const formattedHistory = history
    .filter((m) => m.role === "user" || m.role === "assistant")
    .map((m) => `${m.role.toUpperCase()}: ${m.content}`)
    .join("\n\n");
  const prompt = `${systemPrompt}

--- Conversation History ---
${formattedHistory || "(none)"}
--- End Conversation History ---

USER: ${message}

Provide a direct answer grounded only in the provided code context.`;

  try {
    console.error(`[chat] Calling ${model} (${systemPrompt.length} chars context)...`);
    const { text } = await generateText({
      model: eigen(model),
      prompt,
    });

    const reply = text?.trim();
    console.error(`[chat] Model responded (${reply?.length ?? 0} chars)`);
    if (!reply) {
      return { error: "No response from AI model" };
    }

    return {
      reply,
      image: exploreResult.image,
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return { error: `Chat failed: ${message}` };
  }
}
