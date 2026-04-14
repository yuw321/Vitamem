import type { LLMAdapter, Message, MemorySource } from "../types.js";
import { validateExtraction } from "../memory/extraction-schema.js";

export interface AnthropicAdapterOptions {
  apiKey: string;
  chatModel?: string;
  extractionModel?: string;
  embeddingApiKey: string;
  embeddingModel?: string;
  baseUrl?: string;
  extractionPrompt?: string;
}

const DEFAULT_CHAT_MODEL = "claude-sonnet-4-20250514";
const DEFAULT_EMBEDDING_MODEL = "text-embedding-3-small";

const DEFAULT_EXTRACTION_PROMPT = `You are reviewing a conversation to extract memorable facts about the user.

Extract facts worth remembering long-term — personal details, preferences, goals, habits, important context, and any information the user would expect to be remembered next time.

Conversation:
{conversation}

Return ONLY valid JSON (no markdown fences, no explanation):
{
  "memories": [
    { "content": "specific factual statement", "source": "confirmed", "tags": ["category"] },
    { "content": "another fact derived from context", "source": "inferred", "tags": ["category"] }
  ]
}

Examples:
{ "content": "Prefers TypeScript over JavaScript (mentioned {sessionDate})", "source": "confirmed", "tags": ["preference"] }
{ "content": "Working on a React Native mobile app (mentioned {sessionDate})", "source": "confirmed", "tags": ["professional"] }
{ "content": "Runs 5K three times a week (mentioned {sessionDate})", "source": "confirmed", "tags": ["lifestyle"] }
{ "content": "Goal is to launch MVP by March (mentioned {sessionDate})", "source": "confirmed", "tags": ["goal"] }

Confirmed vs Inferred — WRONG (unsupported inference):
{ "content": "Implementing changes to work-life balance", "source": "inferred", "tags": ["lifestyle"] }
CORRECT (only extract what was stated):
{ "content": "Leaves work by 5pm to pick up kids (mentioned {sessionDate})", "source": "confirmed", "tags": ["lifestyle"] }

## Role-Aware Extraction
- From USER messages: extract all stated facts — these are new user-reported data
- From AI/ASSISTANT messages: extract ONLY genuinely new information (recommendations, advice, instructions). Do NOT re-extract user data that the AI is repeating back from memory context — skip echoed data.

Guidelines:
- Each memory must have: content (string), source ("confirmed" or "inferred"), and tags (array of strings)
- "confirmed" = user directly stated this
- "inferred" = a fact not directly stated but strongly implied by specific evidence in the conversation. Do NOT infer generalizations, assumptions, or speculations.
- When in doubt between inferring a fact and not extracting it, do NOT extract. Only use source "inferred" when the evidence is unambiguous and the inference is narrowly supported by what was actually said.
- Tag each fact with a category: "preference", "goal", "personal", "professional", "lifestyle", or "general"
- Be specific: include numbers, dates, frequencies when mentioned
- Append the session date in parentheses to each extracted fact, e.g., '(mentioned {sessionDate})'. This helps track when information was reported.
- Skip greetings, small talk, and transient emotions
- When a value has been updated, extract ONLY the current value. Do not create a separate fact for the previous value — the system tracks changes automatically.
- Do not extract facts that merely restate information from earlier in the conversation. Focus on what is NEW or CHANGED.
- Return empty memories array if no facts found: { "memories": [] }`;

/**
 * Health-domain extraction prompt with structured profile field support.
 * Use with `structuredExtractionRules: HEALTH_STRUCTURED_RULES` for health companion apps.
 */
export const HEALTH_EXTRACTION_PROMPT_ANTHROPIC = `You are reviewing a health companion conversation to extract memorable facts.

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

Return ONLY valid JSON (no markdown fences, no explanation):
{
  "memories": [
    { "content": "specific factual statement", "source": "confirmed", "tags": ["category"], "profileField": "none" },
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
- "confirmed" = user directly stated this
- "inferred" = a fact not directly stated but strongly implied by specific evidence in the conversation. Do NOT infer generalizations, assumptions, or speculations.
- When in doubt between inferring a fact and not extracting it, do NOT extract. Only use source "inferred" when the evidence is unambiguous and the inference is narrowly supported by what was actually said.
- Tag each fact with a category: "condition", "medication", "lifestyle", "vital", "goal", "social", or "general"
- Be specific: include numbers, dates, frequencies when mentioned
- Append the session date in parentheses to each extracted fact, e.g., '(mentioned {sessionDate})'. This helps track when information was reported.
- Skip greetings, small talk, and transient emotions
- When a value has been updated (e.g., A1C went from 7.4% to 6.8%), extract ONLY the current value as the fact. Do not create a separate fact for the previous value — the system tracks changes automatically.
- Do not extract facts that merely restate information from earlier in the conversation. Focus on what is NEW or CHANGED.
- For health metrics (A1C, blood pressure, weight, glucose, etc.), always extract the most recent value only.
- Return empty memories array if no facts found: { "memories": [] }`;

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
  const extractionModel = opts.extractionModel ?? chatModel;
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

      // Use extraction model (falls back to chat model)
      const client = await getAnthropicClient();
      const response = await client.messages.create({
        model: extractionModel,
        max_tokens: 1024,
        messages: [{ role: "user", content: prompt }],
      });
      const raw = response.content[0].text;
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
      const client = await getOpenAIClient();
      const response = await client.embeddings.create({
        model: embeddingModel,
        input: text,
      });
      return response.data[0].embedding;
    },
  };
}
