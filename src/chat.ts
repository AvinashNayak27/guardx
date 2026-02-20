/**
 * Chat agent for Q&A about Docker image code.
 * Requires OPENAI_API_KEY in environment.
 */

import OpenAI from "openai";
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
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    return { error: "OPENAI_API_KEY is not set in environment" };
  }

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

  const openai = new OpenAI({ apiKey });
  const model = process.env.OPENAI_MODEL ?? "gpt-5-mini";

  const messages: OpenAI.Chat.ChatCompletionMessageParam[] = [
    { role: "system", content: systemPrompt },
    ...history
      .filter((m) => m.role === "user" || m.role === "assistant")
      .map((m) => ({ role: m.role, content: m.content })),
    { role: "user", content: message },
  ];

  try {
    console.error(`[chat] Calling ${model} (${systemPrompt.length} chars context)...`);
    const completion = await openai.chat.completions.create({
      model,
      messages,
    });

    const reply = completion.choices[0]?.message?.content;
    console.error(`[chat] OpenAI responded (${reply?.length ?? 0} chars)`);
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
