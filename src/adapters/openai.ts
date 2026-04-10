import type { LLMAdapter, Message, MemorySource } from "../types.js";

export interface OpenAIAdapterOptions {
  apiKey: string;
  chatModel?: string;
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

Return a JSON array only (no markdown, no explanation):
[{ "content": "brief factual statement", "source": "confirmed" | "inferred" }]

Guidelines:
- "confirmed" = user directly stated this fact
- "inferred" = you derived this from context
- Skip greetings, questions, and one-time events
- Be specific (include numbers, dosages, dates when mentioned)`;

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
          model: chatModel,
          input: [{ role: "user", content: prompt }],
          ...safeOpts,
        });
        raw = response.output_text ?? "[]";
      } else {
        const response = await client.chat.completions.create({
          model: chatModel,
          messages: [{ role: "user", content: prompt }],
          ...safeOpts,
        });
        raw = response.choices[0].message.content ?? "[]";
      }
      return JSON.parse(cleanJsonResponse(raw));
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
