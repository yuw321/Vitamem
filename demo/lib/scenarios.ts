// ---------------------------------------------------------------------------
// Guided walkthrough scenarios for the Vitamem interactive demo
// ---------------------------------------------------------------------------

export type ScenarioAction =
  | { type: "sendMessage"; message: string; description?: string }
  | { type: "waitForReply"; description?: string }
  | { type: "endSession"; description: string }
  | { type: "newSession"; description: string }
  | { type: "searchMemory"; query: string; description: string }
  | { type: "pinMemory"; memoryIndex: number; description: string }
  | { type: "unpinMemory"; memoryIndex: number; description: string }
  | { type: "sweepThreads"; description: string }
  | { type: "closeThread"; description: string }
  | {
      type: "pause";
      message: string;
      duration?: number;
    }
  | {
      type: "highlight";
      element: string;
      message: string;
    };

export interface Scenario {
  id: string;
  name: string;
  description: string;
  estimatedTime: string;
  features: string[];
  steps: ScenarioAction[];
}

// ---------------------------------------------------------------------------
// Demo 1 — First Visit
// ---------------------------------------------------------------------------

const firstVisit: Scenario = {
  id: "first-visit",
  name: "First Visit",
  description:
    "The user's first session — watch how Vitamem captures their story through chat, extracts structured memories, and auto-pins critical safety information.",
  estimatedTime: "~3 minutes",
  features: ["chat", "extraction", "source classification", "auto-pin"],
  steps: [
    {
      type: "pause",
      message:
        "Meet your user. They're visiting for the first time — let's see how Vitamem captures their story."
    },
    {
      type: "sendMessage",
      message:
        "Hi! I've been managing Type 2 diabetes for about 3 years now. I take metformin 1000mg twice a day.",
      description: "User introduces their condition and medication."
    },
    {
      type: "waitForReply",
      description: "AI acknowledges the health background.",
    },
    {
      type: "sendMessage",
      message:
        "I'm also allergic to penicillin — found out the hard way last year. My last A1C was 7.4% and my doctor wants me under 7.0.",
      description: "User shares allergy and lab results."
    },
    {
      type: "waitForReply",
      description: "AI responds to allergy and A1C information.",
    },
    {
      type: "sendMessage",
      message:
        "I exercise Monday, Wednesday, Friday and I've been cutting carbs to help get that number down.",
      description: "User shares lifestyle and goals."
    },
    {
      type: "waitForReply",
      description: "AI provides encouragement and follow-up.",
    },
    {
      type: "pause",
      message:
        "Good first conversation! Now let's end this session to trigger memory extraction.",
    },
    {
      type: "endSession",
      description:
        "Triggering memory extraction — watch the pipeline animation on the right.",
    },
    {
      type: "highlight",
      element: "pipeline-viz",
      message:
        "Notice the pipeline included a 'Reflection' step — Vitamem ran a second validation pass on what it extracted. This catches contradictions and verifies fact quality before anything is saved.",
    },
    {
      type: "highlight",
      element: "memory-panel",
      message:
        "Vitamem extracted the key facts from the conversation. The pin icons show the allergy and medication dosage were auto-pinned as safety-critical, and the source badges show 'confirmed' for things the user stated directly. Notice the colored priority badges (CRITICAL, IMPORTANT, INFO) — the allergy and dosage were flagged CRITICAL. Each fact also includes a date chip showing when it was learned.",
    },
  ],
};

// ---------------------------------------------------------------------------
// Demo 2 — The Follow-up
// ---------------------------------------------------------------------------

const theFollowup: Scenario = {
  id: "the-followup",
  name: "The Follow-up",
  description:
    "The user returns for a follow-up visit. Watch how Vitamem automatically retrieves memories from the first visit and updates the A1C value in-place when it changes.",
  estimatedTime: "~3 minutes",
  features: [
    "autoRetrieve",
    "supersede",
    "deduplication",
    "cross-session memory",
  ],
  steps: [
    {
      type: "pause",
      message:
        "The user returns for a follow-up. Vitamem still has their memories from the first visit — watch how the AI uses them."
    },
    {
      type: "newSession",
      description: "Starting a new session for the follow-up visit.",
    },
    {
      type: "sendMessage",
      message: "Hey, I'm back! Had my checkup yesterday.",
      description: "User returns for follow-up."
    },
    {
      type: "waitForReply",
      description:
        "AI responds using autoRetrieve — references diabetes, metformin, and other memories.",
    },
    {
      type: "pause",
      message:
        "See the 'Memories used' section under the AI's reply? Expand it. Those are memories from Demo 1 that Vitamem automatically retrieved — it embedded your message, searched for similar memories using vector similarity, and injected them into the AI's context. The scores show how relevant each memory was. Notice the CRITICAL and IMPORTANT markers telling the AI which facts matter most, and how memories are grouped chronologically by when they were learned.",
    },
    {
      type: "sendMessage",
      message:
        "Great news — my A1C came back at 6.8%! Down from 7.4! The diet and exercise changes are really paying off.",
      description: "User reports improved A1C."
    },
    {
      type: "waitForReply",
      description:
        "AI celebrates the improvement, referencing the previous A1C.",
    },
    {
      type: "pause",
      message:
        "The AI mentioned the previous A1C of 7.4% — that came directly from the retrieved memories. Expand 'Memories used' again to see which memories were pulled in. Without autoRetrieve, the AI would have no idea about the user's history. Now let's end this session and watch what happens to the A1C memory in the panel.",
    },
    {
      type: "endSession",
      description:
        "Triggering extraction — the supersede step will update the A1C memory in-place.",
    },
    {
      type: "highlight",
      element: "memory-panel",
      message:
        "Look at the A1C memory — it now says 6.8% instead of 7.4%. Vitamem recognized this as the same metric with an updated value and superseded (replaced) it in-place, not duplicated. The metformin memory wasn't duplicated either — deduplication caught it. This is how memory stays clean over time: new values replace old ones, and repeated facts are merged, not piled up.",
    },
  ],
};

// ---------------------------------------------------------------------------
// Demo 3 — Thread Lifecycle
// ---------------------------------------------------------------------------

const threadLifecycle: Scenario = {
  id: "thread-lifecycle",
  name: "Thread Lifecycle",
  description:
    "See how Vitamem manages conversation threads — dormant guards prevent stale conversations, and sweepThreads automates lifecycle transitions.",
  estimatedTime: "~2 minutes",
  features: [
    "dormant guard",
    "thread redirect",
    "sweepThreads",
    "close thread",
  ],
  steps: [
    {
      type: "pause",
      message:
        "Your user's data is safe in memory. Now let's look at how Vitamem manages conversation threads over time."
    },
    {
      type: "sendMessage",
      message:
        "Quick question — should I take my metformin with food or on an empty stomach?",
      description: "User asks a quick question."
    },
    {
      type: "waitForReply",
      description:
        "AI responds using memories — knows about the metformin prescription.",
    },
    {
      type: "endSession",
      description: "Ending the session — thread becomes dormant.",
    },
    {
      type: "pause",
      message:
        "Watch the timeline on the right — the thread has transitioned from Active to Dormant and memories have been extracted. What happens if the user comes back to this same thread?",
    },
    {
      type: "sendMessage",
      message: "Oh wait, one more thing about my medication...",
      description:
        "User tries to continue on the dormant thread."
    },
    {
      type: "waitForReply",
      description:
        "Vitamem detects the dormant thread and auto-redirects to a new one.",
    },
    {
      type: "pause",
      message:
        "Vitamem detected the dormant thread and automatically created a new one. The timeline now shows two threads — the original dormant one and a fresh Active thread below it. The user's message was preserved — no data lost.",
    },
    {
      type: "sweepThreads",
      description:
        "Running sweepThreads — processes all threads based on timeout settings.",
    },
    {
      type: "pause",
      message:
        "The timeline shows both threads processed — the old thread is now Closed while the new thread remains Active. In production, you'd run sweepThreads on a schedule (cron job or setInterval). Threads transition: Active → Cooling → Dormant → Closed.",
    },
  ],
};

// ---------------------------------------------------------------------------
// Demo 4 — Memory Quality
// ---------------------------------------------------------------------------

const memoryQuality: Scenario = {
  id: "memory-quality",
  name: "Memory Quality",
  description:
    "See how Vitamem validates and maintains memory quality — catching contradictions through reflection and showing how memory relevance naturally decays over time.",
  estimatedTime: "~2 minutes",
  features: ["reflection", "contradiction detection", "active forgetting", "decay"],
  steps: [
    {
      type: "pause",
      message:
        "You've seen Vitamem capture, recall, and manage memories. Now let's see how it maintains quality over time — like human memory, it validates what it learns and lets irrelevant details fade.",
    },
    {
      type: "newSession",
      description: "Starting a new session to demonstrate memory quality.",
    },
    {
      type: "sendMessage",
      message:
        "Actually, I need to correct something — I've been taking metformin 500mg, not 1000mg. My pharmacist noticed the mix-up last week and fixed the dosage.",
      description: "User corrects a previous memory — triggers contradiction detection.",
    },
    {
      type: "waitForReply",
      description: "AI acknowledges the dosage correction.",
    },
    {
      type: "endSession",
      description:
        "Triggering extraction with reflection — watch for the contradiction detection.",
    },
    {
      type: "highlight",
      element: "pipeline-viz",
      message:
        "Watch the 'Reflection validation' step in the pipeline — Vitamem's second LLM pass detected the contradiction between the new 500mg dosage and the previously stored 1000mg. It corrected the memory automatically.",
    },
    {
      type: "highlight",
      element: "memory-panel",
      message:
        "Check the metformin memory — the dosage now reflects 500mg. Reflection caught the conflict and updated it, no manual intervention needed. Notice the date chip showing when this correction was learned.",
    },
    {
      type: "pause",
      message:
        "Now look at the retrieval counts in the memory panel. Some memories show 'Retrieved 3x' while others show 'Never retrieved'. In a real system running over weeks, memories that are never accessed gradually fade in relevance — just like how you forget unused information. Frequently retrieved facts stay strong.",
    },
    {
      type: "highlight",
      element: "memory-panel",
      message:
        "Memories with low retrieval counts score lower in future searches and appear faded. But pinned memories like the penicillin allergy are immune to decay — they stay top priority forever, just like how you never forget a life-threatening allergy. This is active forgetting: Vitamem's version of 'use it or lose it'.",
    },
  ],
};

// ---------------------------------------------------------------------------
// Exports
// ---------------------------------------------------------------------------

export const SCENARIOS: Scenario[] = [firstVisit, theFollowup, threadLifecycle, memoryQuality];

export function getDefaultScenario(): Scenario {
  return SCENARIOS[0];
}

export function getScenarioById(id: string): Scenario | undefined {
  return SCENARIOS.find((s) => s.id === id);
}

export function getScenarioIndex(id: string): number {
  return SCENARIOS.findIndex((s) => s.id === id);
}

export function getNextScenario(currentIndex: number): Scenario | undefined {
  return SCENARIOS[currentIndex + 1];
}
