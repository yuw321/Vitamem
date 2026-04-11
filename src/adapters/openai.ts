import type { LLMAdapter, Message, MemorySource } from "../types.js";
import { validateExtraction } from "../memory/extraction-schema.js";

export interface OpenAIAdapterOptions {
  apiKey: string;
  chatModel?: string;
  extractionModel?: string;
  embeddingModel?: string;
  baseUrl?: string;
  extractionPrompt?: string;

  /**
   * Which OpenAI API surface to use for chat / extraction calls.
   * - `'completions'` — POST /v1/chat/completions (default, widely compatible)
   * - `'responses'` — POST /v1/responses (OpenAI's newer API with extended features)
   *
   * @default 'completions'
   */
  apiMode?: 'completions' | 'responses';

  /**
   * Pass-through options spread into every chat / completion SDK call.
   * Allows provider-specific parameters without explicit Vitamem support.
   *
   * @example { temperature: 0.7, max_tokens: 1024, reasoning: { effort: "medium" } }
   */
  extraChatOptions?: Record<string, unknown>;

  /**
   * Pass-through options spread into every embedding SDK call.
   *
   * @example { dimensions: 512 }
   */
  extraEmbeddingOptions?: Record<string, unknown>;
}

const DEFAULT_CHAT_MODEL = "gpt-5.4-mini";
const DEFAULT_EMBEDDING_MODEL = "text-embedding-3-small";

const DEFAULT_EXTRACTION_PROMPT = `Extract key facts from this conversation that are worth remembering long-term.
Focus on: health conditions, medications, lifestyle habits, goals, preferences, and personal context.

Conversation:
{conversation}

Return ONLY valid JSON (no markdown, no explanation):
{
  "memories": [
    { "content": "brief factual statement", "source": "confirmed", "tags": ["category"] },
    { "content": "another fact derived from context", "source": "inferred", "tags": ["category"] }
  ]
}

Guidelines:
- Each memory must have: content (string), source ("confirmed" or "inferred"), and tags (array of strings)
- "confirmed" = user directly stated this fact
- "inferred" = you derived this from context
- Tag each fact with a category: "condition", "medication", "lifestyle", "vital", "goal", "social", or "general"
- Skip greetings, questions, and one-time events
- Be specific (include numbers, dosages, dates when mentioned)
- When a value has been updated (e.g., A1C went from 7.4% to 6.8%), extract ONLY the current value as the fact. Do not create a separate fact for the previous value — the system tracks changes automatically.
- Do not extract facts that merely restate information from earlier in the conversation. Focus on what is NEW or CHANGED.
- For health metrics (A1C, blood pressure, weight, glucose, etc.), always extract the most recent value only.
- Return empty memories array if no facts found: { "memories": [] }`;

/**
 * Strip options that are only valid for streaming calls.
 * DashScope (and potentially other providers) reject `enable_thinking`
 * when `stream` is not set to `true`.
 */
function nonStreamOptions(opts: Record<string, unknown>): Record<string, unknown> {
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const { enable_thinking, ...rest } = opts;
  return rest;
}

function cleanJsonResponse(raw: string): string {
  return raw
    .replace(/^```(?:json)?\n?/, "")
    .replace(/\n?```$/, "")
    .trim();
}

/**
 * Create an LLM adapter for OpenAI or any OpenAI-compatible API
 * (Ollama, vLLM, LM Studio, Azure OpenAI, etc.).
 *
 * Requires the `openai` npm package as a peer dependency.
 */
export function createOpenAIAdapter(opts: OpenAIAdapterOptions): LLMAdapter {
  const chatModel = opts.chatModel ?? DEFAULT_CHAT_MODEL;
  const extractionModel = opts.extractionModel ?? chatModel;
  const embeddingModel = opts.embeddingModel ?? DEFAULT_EMBEDDING_MODEL;
  const extractionPrompt = opts.extractionPrompt ?? DEFAULT_EXTRACTION_PROMPT;
  const apiMode = opts.apiMode ?? 'completions';
  const extraChatOptions = opts.extraChatOptions ?? {};
  const extraEmbeddingOptions = opts.extraEmbeddingOptions ?? {};

  // Lazy-load the OpenAI SDK to keep it as an optional peer dependency
  let clientPromise: Promise<InstanceType<any>> | null = null;

  function getClient(): Promise<InstanceType<any>> {
    if (!clientPromise) {
      clientPromise = import("openai").then(({ default: OpenAI }) => {
        return new OpenAI({
          apiKey: opts.apiKey,
          ...(opts.baseUrl && { baseURL: opts.baseUrl }),
        });
      });
    }
    return clientPromise;
  }

  return {
    async chat(
      messages: Array<{ role: string; content: string }>,
    ): Promise<string> {
      const client = await getClient();

      // Non-streaming calls must not include streaming-only options
      const safeOpts = nonStreamOptions(extraChatOptions);

      if (apiMode === 'responses') {
        const response = await client.responses.create({
          model: chatModel,
          input: messages.map((m) => ({
            role: m.role as "user" | "assistant" | "system",
            content: m.content,
          })),
          ...safeOpts,
        });
        return response.output_text ?? "";
      }

      const response = await client.chat.completions.create({
        model: chatModel,
        messages: messages.map((m) => ({
          role: m.role as "user" | "assistant" | "system",
          content: m.content,
        })),
        ...safeOpts,
      });
      return response.choices[0].message.content ?? "";
    },

    async *chatStream(
      messages: Array<{ role: string; content: string }>,
    ): AsyncGenerator<string, void, unknown> {
      const client = await getClient();

      if (apiMode === 'responses') {
        const stream = await client.responses.create({
          model: chatModel,
          input: messages.map((m) => ({
            role: m.role as "user" | "assistant" | "system",
            content: m.content,
          })),
          stream: true,
          ...extraChatOptions,
        });
        for await (const event of stream) {
          if (event.type === 'response.output_text.delta') {
            yield event.delta;
          }
        }
        return;
      }

      const stream = await client.chat.completions.create({
        model: chatModel,
        messages: messages.map((m) => ({
          role: m.role as "user" | "assistant" | "system",
          content: m.content,
        })),
        stream: true,
        ...extraChatOptions,
      });
      for await (const chunk of stream) {
        const content = chunk.choices[0]?.delta?.content;
        if (content) yield content;
      }
    },

    async extractMemories(
      messages: Message[],
    ): Promise<Array<{ content: string; source: MemorySource }>> {
      const conversation = messages
        .map((m) => `${m.role}: ${m.content}`)
        .join("\n");

      const prompt = extractionPrompt.replace("{conversation}", conversation);

      const client = await getClient();

      // Non-streaming calls must not include streaming-only options
      const safeOpts = nonStreamOptions(extraChatOptions);

      let raw: string;
      if (apiMode === 'responses') {
        const response = await client.responses.create({
          model: extractionModel,
          input: [{ role: "user", content: prompt }],
          text: { format: { type: "json_object" } },
          ...safeOpts,
        });
        raw = response.output_text ?? "{}";
      } else {
        const response = await client.chat.completions.create({
          model: extractionModel,
          messages: [{ role: "user", content: prompt }],
          response_format: { type: "json_object" },
          ...safeOpts,
        });
        raw = response.choices[0].message.content ?? "{}";
      }
      let parsed;
      try {
        parsed = JSON.parse(cleanJsonResponse(raw));
      } catch (parseError) {
        console.warn('[vitamem:extraction] JSON parse failed, raw response:', raw.substring(0, 200));
        return [];
      }
      return validateExtraction(parsed);
    },

    async embed(text: string): Promise<number[]> {
      const client = await getClient();
      const response = await client.embeddings.create({
        model: embeddingModel,
        input: text,
        ...extraEmbeddingOptions,
      });
      return response.data[0].embedding;
    },
  };
}
