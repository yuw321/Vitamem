import type { LLMAdapter, Message, MemorySource } from "../types.js";

export interface AnthropicAdapterOptions {
  apiKey: string;
  chatModel?: string;
  embeddingApiKey: string;
  embeddingModel?: string;
  baseUrl?: string;
  extractionPrompt?: string;
}

const DEFAULT_CHAT_MODEL = "claude-sonnet-4-20250514";
const DEFAULT_EMBEDDING_MODEL = "text-embedding-3-small";

const DEFAULT_EXTRACTION_PROMPT = `You are reviewing a health companion conversation to extract memorable facts.

Extract facts worth remembering long-term about this person's health and wellbeing.

Categories to focus on:
- Medical conditions (diagnosed, suspected, or family history)
- Medications, supplements, and dosages
- Vital signs and lab values (A1C, blood pressure, weight, etc.)
- Lifestyle (diet, exercise, sleep patterns, stress levels)
- Health goals and progress
- Preferences for how they like to be supported
- Care team (doctors, therapists, specialists)

Conversation:
{conversation}

Return a JSON array only (no markdown fences, no explanation):
[{ "content": "specific factual statement", "source": "confirmed" | "inferred" }]

- "confirmed" = user directly stated this
- "inferred" = you derived this from context
- Be specific: include numbers, dates, frequencies when mentioned
- Skip greetings, small talk, and transient emotions`;

function cleanJsonResponse(raw: string): string {
  return raw
    .replace(/^```(?:json)?\n?/, "")
    .replace(/\n?```$/, "")
    .trim();
}

/**
 * Create an LLM adapter for Anthropic Claude.
 *
 * Since Anthropic does not offer an embedding API, embeddings are provided
 * via OpenAI (or any OpenAI-compatible endpoint) using the `openai` SDK.
 *
 * Requires both `@anthropic-ai/sdk` and `openai` as peer dependencies.
 */
export function createAnthropicAdapter(
  opts: AnthropicAdapterOptions,
): LLMAdapter {
  const chatModel = opts.chatModel ?? DEFAULT_CHAT_MODEL;
  const embeddingModel = opts.embeddingModel ?? DEFAULT_EMBEDDING_MODEL;
  const extractionPrompt = opts.extractionPrompt ?? DEFAULT_EXTRACTION_PROMPT;

  let anthropicClientPromise: Promise<InstanceType<any>> | null = null;
  let openaiClientPromise: Promise<InstanceType<any>> | null = null;

  function getAnthropicClient(): Promise<InstanceType<any>> {
    if (!anthropicClientPromise) {
      anthropicClientPromise = import("@anthropic-ai/sdk").then(
        ({ default: Anthropic }) => {
          return new Anthropic({
            apiKey: opts.apiKey,
            ...(opts.baseUrl && { baseURL: opts.baseUrl }),
          });
        },
      );
    }
    return anthropicClientPromise;
  }

  function getOpenAIClient(): Promise<InstanceType<any>> {
    if (!openaiClientPromise) {
      openaiClientPromise = import("openai").then(({ default: OpenAI }) => {
        return new OpenAI({ apiKey: opts.embeddingApiKey });
      });
    }
    return openaiClientPromise;
  }

  return {
    async chat(
      messages: Array<{ role: string; content: string }>,
    ): Promise<string> {
      const client = await getAnthropicClient();

      // Separate system messages (Anthropic API requirement)
      const systemMessages = messages.filter((m) => m.role === "system");
      const conversationMessages = messages.filter((m) => m.role !== "system");

      const system =
        systemMessages.length > 0
          ? systemMessages.map((m) => m.content).join("\n")
          : undefined;

      const response = await client.messages.create({
        model: chatModel,
        max_tokens: 1024,
        ...(system && { system }),
        messages: conversationMessages.map((m) => ({
          role: m.role as "user" | "assistant",
          content: m.content,
        })),
      });

      return response.content[0].text;
    },

    async *chatStream(
      messages: Array<{ role: string; content: string }>,
    ): AsyncGenerator<string, void, unknown> {
      const client = await getAnthropicClient();

      const systemMessages = messages.filter((m) => m.role === "system");
      const conversationMessages = messages.filter((m) => m.role !== "system");

      const system =
        systemMessages.length > 0
          ? systemMessages.map((m) => m.content).join("\n")
          : undefined;

      const stream = await client.messages.create({
        model: chatModel,
        max_tokens: 1024,
        ...(system && { system }),
        messages: conversationMessages.map((m) => ({
          role: m.role as "user" | "assistant",
          content: m.content,
        })),
        stream: true,
      });

      for await (const event of stream) {
        if (event.type === 'content_block_delta' && event.delta.type === 'text_delta') {
          yield event.delta.text;
        }
      }
    },

    async extractMemories(
      messages: Message[],
    ): Promise<Array<{ content: string; source: MemorySource }>> {
      const conversation = messages
        .map((m) => `${m.role}: ${m.content}`)
        .join("\n");

      const prompt = extractionPrompt.replace("{conversation}", conversation);

      // Use the chat method for extraction
      const raw = await this.chat([{ role: "user", content: prompt }]);
      return JSON.parse(cleanJsonResponse(raw));
    },

    async embed(text: string): Promise<number[]> {
      const client = await getOpenAIClient();
      const response = await client.embeddings.create({
        model: embeddingModel,
        input: text,
      });
      return response.data[0].embedding;
    },
  };
}
