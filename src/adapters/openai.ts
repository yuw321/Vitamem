import type { LLMAdapter, Message, MemorySource } from "../types.js";

export interface OpenAIAdapterOptions {
  apiKey: string;
  chatModel?: string;
  embeddingModel?: string;
  baseUrl?: string;
  extractionPrompt?: string;
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
      const response = await client.chat.completions.create({
        model: chatModel,
        messages: messages.map((m) => ({
          role: m.role as "user" | "assistant" | "system",
          content: m.content,
        })),
      });
      return response.choices[0].message.content ?? "";
    },

    async extractMemories(
      messages: Message[],
    ): Promise<Array<{ content: string; source: MemorySource }>> {
      const conversation = messages
        .map((m) => `${m.role}: ${m.content}`)
        .join("\n");

      const prompt = extractionPrompt.replace("{conversation}", conversation);

      const client = await getClient();
      const response = await client.chat.completions.create({
        model: chatModel,
        messages: [{ role: "user", content: prompt }],
      });

      const raw = response.choices[0].message.content ?? "[]";
      return JSON.parse(cleanJsonResponse(raw));
    },

    async embed(text: string): Promise<number[]> {
      const client = await getClient();
      const response = await client.embeddings.create({
        model: embeddingModel,
        input: text,
      });
      return response.data[0].embedding;
    },
  };
}
