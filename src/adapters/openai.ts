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
Focus on: personal details, preferences, goals, habits, important context, and any information the user would expect to be remembered next time.

Conversation:
{conversation}

Return ONLY valid JSON (no markdown, no explanation):
{
  "memories": [
    { "content": "brief factual statement", "source": "confirmed", "tags": ["category"] },
    { "content": "another fact derived from context", "source": "inferred", "tags": ["category"] }
  ]
}

Examples:
{ "content": "Prefers TypeScript over JavaScript (mentioned {sessionDate})", "source": "confirmed", "tags": ["preference"] }
{ "content": "Working on a React Native mobile app (mentioned {sessionDate})", "source": "confirmed", "tags": ["professional"] }
{ "content": "Runs 5K three times a week (mentioned {sessionDate})", "source": "confirmed", "tags": ["lifestyle"] }
{ "content": "Goal is to launch MVP by March (mentioned {sessionDate})", "source": "confirmed", "tags": ["goal"] }
{ "content": "Has two kids in elementary school (mentioned {sessionDate})", "source": "confirmed", "tags": ["personal"] }
{ "content": "Seems to prefer concise explanations (mentioned {sessionDate})", "source": "inferred", "tags": ["preference"] }

Confirmed vs Inferred — WRONG (unsupported inference):
{ "content": "Implementing changes to work-life balance", "source": "inferred", "tags": ["lifestyle"] }
CORRECT (only extract what was stated):
{ "content": "Leaves work by 5pm to pick up kids (mentioned {sessionDate})", "source": "confirmed", "tags": ["lifestyle"] }

## Role-Aware Extraction
- From USER messages: extract all stated facts — these are new user-reported data
- From AI/ASSISTANT messages: extract ONLY genuinely new information (recommendations, advice, instructions). Do NOT re-extract user data that the AI is repeating back from memory context — skip echoed data.

WRONG (re-extracting echoed data):
AI says: "Since you prefer TypeScript, here's a typed example"
{ "content": "Prefers TypeScript", "source": "inferred", "tags": ["preference"] }

CORRECT (extract only new AI-provided information):
AI says: "Since you prefer TypeScript, I recommend using Zod for runtime validation."
{ "content": "Recommended using Zod for runtime validation (mentioned {sessionDate})", "source": "inferred", "tags": ["professional"] }

Guidelines:
- Each memory must have: content (string), source ("confirmed" or "inferred"), and tags (array of strings)
- "confirmed" = user directly stated this fact
- "inferred" = a fact not directly stated but strongly implied by specific evidence in the conversation. Do NOT infer generalizations, assumptions, or speculations.
- When in doubt between inferring a fact and not extracting it, do NOT extract. Only use source "inferred" when the evidence is unambiguous and the inference is narrowly supported by what was actually said.
- Tag each fact with a category: "preference", "goal", "personal", "professional", "lifestyle", or "general"
- Skip greetings, questions, and one-time events
- Be specific (include numbers, dates, names when mentioned)
- Append the session date in parentheses to each extracted fact, e.g., '(mentioned {sessionDate})'. This helps track when information was reported.
- When a value has been updated, extract ONLY the current value. Do not create a separate fact for the previous value — the system tracks changes automatically.
- Do not extract facts that merely restate information from earlier in the conversation. Focus on what is NEW or CHANGED.
- Return empty memories array if no facts found: { "memories": [] }`;

/**
 * Health-domain extraction prompt with structured profile field support.
 * Use with `structuredExtractionRules: HEALTH_STRUCTURED_RULES` for health companion apps.
 */
export const HEALTH_EXTRACTION_PROMPT = `Extract key facts from this conversation that are worth remembering long-term.
Focus on: health conditions, medications, lifestyle habits, goals, preferences, and personal context.

Conversation:
{conversation}

Return ONLY valid JSON (no markdown, no explanation):
{
  "memories": [
    { "content": "brief factual statement", "source": "confirmed", "tags": ["category"], "profileField": "none" },
    { "content": "another fact derived from context", "source": "inferred", "tags": ["category"], "profileField": "none" }
  ]
}

Every fact MUST include a profileField. Set it to one of: "conditions", "medications", "allergies", "vitals", "goals", or "none". Use "none" when the fact is general context that does not map to a specific profile field.

Additional fields for profile-mapped facts:
- "profileValue": the extracted value (string for conditions/allergies/goals, object for medications, number for vitals)
- "profileKey": (vitals only) the metric name, e.g. "a1c", "blood_pressure", "weight"
- "profileUnit": (vitals only) the unit, e.g. "%", "mmHg", "lbs"

IMPORTANT: Only classify a value as profileField "vitals" when it is an actual measurement or lab result (e.g., "My A1C came back at 7.4%", "blood pressure is 130/85"). When the user mentions a target, goal, or desired threshold (e.g., "doctor wants me under 7%", "aiming for 120 lbs", "goal of reducing cholesterol"), classify it as profileField "goals" with the target description as profileValue. NEVER classify a goal or target as a vital.

For medications, profileValue should be: { "name": "...", "dosage": "...", "frequency": "..." }
For medications, always extract the complete frequency (e.g., "twice daily", not "twice"). The medication profileValue object must have complete dosage and frequency fields when mentioned by the user.
For allergies, conditions, goals: profileValue is a simple string.
For conditions, extract only the clean medical term as profileValue (e.g., "Type 2 diabetes"), not conversational phrasing (e.g., NOT "been managing Type 2 diabetes" or "diagnosed with Type 2 diabetes last year"). Strip verbs, temporal context, and filler words from profileValue.
Examples:
{ "content": "Latest A1C is 6.8% (mentioned {sessionDate})", "source": "confirmed", "tags": ["vital"], "profileField": "vitals", "profileKey": "a1c", "profileValue": 6.8, "profileUnit": "%" }
{ "content": "Allergic to penicillin (mentioned {sessionDate})", "source": "confirmed", "tags": ["allergy"], "profileField": "allergies", "profileValue": "penicillin" }
{ "content": "Takes metformin 1000mg twice daily (mentioned {sessionDate})", "source": "confirmed", "tags": ["medication"], "profileField": "medications", "profileValue": { "name": "metformin", "dosage": "1000mg", "frequency": "twice daily" } }
{ "content": "Has Type 2 diabetes (mentioned {sessionDate})", "source": "confirmed", "tags": ["condition"], "profileField": "conditions", "profileValue": "Type 2 diabetes" }
{ "content": "Wants to lower A1C below 7% (mentioned {sessionDate})", "source": "confirmed", "tags": ["goal"], "profileField": "goals", "profileValue": "Lower A1C below 7%" }
{ "content": "Exercises Monday, Wednesday, and Friday (mentioned {sessionDate})", "source": "confirmed", "tags": ["lifestyle"], "profileField": "none" }

Goal vs Vital distinction — WRONG:
{ "content": "Doctor wants A1C under 7%", "source": "confirmed", "tags": ["vital"], "profileField": "vitals", "profileKey": "a1c", "profileValue": 7.0, "profileUnit": "%" }
CORRECT:
{ "content": "Doctor wants A1C under 7% (mentioned {sessionDate})", "source": "confirmed", "tags": ["goal"], "profileField": "goals", "profileValue": "A1C under 7%" }

Confirmed vs Inferred inference — WRONG (unsupported inference):
{ "content": "Implementing changes to exercise routine", "source": "inferred", "tags": ["lifestyle"], "profileField": "none" }
CORRECT (only extract what was stated):
{ "content": "Exercises Monday, Wednesday, and Friday (mentioned {sessionDate})", "source": "confirmed", "tags": ["lifestyle"], "profileField": "none" }

## Role-Aware Extraction
- From USER messages: extract all stated facts — these are new user-reported data
- From AI/ASSISTANT messages: extract ONLY genuinely new information (medical advice, care instructions, recommendations). Do NOT re-extract user data that the AI is repeating back from memory (e.g., if the AI says "your A1C is 6.8%", that is echoed data, not a new measurement — skip it)
- If the AI provides a NEW recommendation or instruction (e.g., "take metformin with food to reduce stomach upset"), that IS worth extracting as an inferred fact

WRONG (re-extracting echoed data):
AI says: "Based on your records, your A1C is 6.8% and you take metformin 1000mg"
{ "content": "A1C is 6.8%", "source": "inferred", "tags": ["vital"], "profileField": "vitals" }

CORRECT (extract only new AI-provided information):
AI says: "Based on your records, your A1C is 6.8%. I recommend taking metformin with food."
{ "content": "Take metformin with food to reduce stomach upset (mentioned {sessionDate})", "source": "inferred", "tags": ["medication"], "profileField": "none" }

Guidelines:
- Each memory must have: content (string), source ("confirmed" or "inferred"), and tags (array of strings)
- "confirmed" = user directly stated this fact
- "inferred" = a fact not directly stated but strongly implied by specific evidence in the conversation. Do NOT infer generalizations, assumptions, or speculations.
- When in doubt between inferring a fact and not extracting it, do NOT extract. Only use source "inferred" when the evidence is unambiguous and the inference is narrowly supported by what was actually said.
- Tag each fact with a category: "condition", "medication", "lifestyle", "vital", "goal", "social", or "general"
- Skip greetings, questions, and one-time events
- Be specific (include numbers, dosages, dates when mentioned)
- Append the session date in parentheses to each extracted fact, e.g., '(mentioned {sessionDate})'. This helps track when information was reported.
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
      sessionDate?: string,
    ): Promise<Array<{
      content: string;
      source: MemorySource;
      tags?: string[];
      profileField?: 'conditions' | 'medications' | 'allergies' | 'vitals' | 'goals' | 'none';
      profileKey?: string;
      profileValue?: string | number | { name: string; dosage?: string; frequency?: string };
      profileUnit?: string;
    }>> {
      const conversation = messages
        .map((m) => `${m.role}: ${m.content}`)
        .join("\n");

      const dateStr = sessionDate ?? new Date().toISOString().slice(0, 10);
      let prompt = extractionPrompt.replace("{conversation}", conversation);
      prompt = prompt.replace(/\{sessionDate\}/g, dateStr);

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
