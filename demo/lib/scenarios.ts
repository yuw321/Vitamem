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
// Scenario 1 — Health Companion Check-in (default)
// ---------------------------------------------------------------------------

const healthCheckin: Scenario = {
  id: "health-checkin",
  name: "Health Companion Check-in",
  description:
    "Walk through a complete two-session health companion workflow — chat, memory extraction, embedding, deduplication, and automatic retrieval across sessions.",
  estimatedTime: "~3 minutes",
  features: [
    "chat",
    "extraction",
    "embedding",
    "dedup",
    "retrieval",
    "autoRetrieve",
  ],
  steps: [
    // ── Introduction ──
    {
      type: "pause",
      message:
        "Welcome! This guided demo walks you through a complete Vitamem workflow with real API calls. We'll simulate a health companion that remembers your patient across sessions.",
    },
    {
      type: "highlight",
      element: "chat-input",
      message:
        "Let's start Session 1. The first three messages simulate a patient check-in.",
    },

    // ── Session 1 messages ──
    {
      type: "sendMessage",
      message: "Hi! I've been managing Type 2 diabetes for about 3 years now.",
      description: "Patient introduces their primary condition.",
    },
    {
      type: "waitForReply",
      description: "AI acknowledges the diabetes history.",
    },
    {
      type: "sendMessage",
      message:
        "I take metformin 1000mg twice a day. My last A1C was 7.4.",
      description: "Patient shares medication and lab results.",
    },
    {
      type: "waitForReply",
      description: "AI responds with relevant follow-up questions.",
    },
    {
      type: "sendMessage",
      message:
        "My doctor wants me to get it under 7.0. I exercise Mon/Wed/Fri and I've been cutting carbs.",
      description: "Patient shares goals and lifestyle details.",
    },
    {
      type: "waitForReply",
      description: "AI provides encouragement and suggestions.",
    },

    // ── Trigger dormant transition ──
    {
      type: "pause",
      message:
        "Great! The AI has responded to all messages. Now let's end this session to trigger memory extraction. Click 'End Session' or press Next to auto-trigger.",
    },
    {
      type: "endSession",
      description:
        "Triggering dormant transition — watch the extraction pipeline animation on the right!",
    },
    {
      type: "pause",
      message:
        "Notice the pipeline: LLM extracted facts → embedded them → checked for duplicates → saved to storage. The Memory panel now shows the extracted memories with 'confirmed' and 'inferred' badges.",
    },
    {
      type: "highlight",
      element: "memory-panel",
      message:
        "These memories are now stored and will be retrieved in the next session.",
    },

    // ── Session 2 — follow-up visit ──
    {
      type: "newSession",
      description:
        "Starting Session 2 — the patient returns for a follow-up visit.",
    },
    {
      type: "sendMessage",
      message: "Hey, I'm back! Had a checkup yesterday.",
      description: "Patient returns in a new session.",
    },
    {
      type: "waitForReply",
      description: "AI responds — memories are automatically retrieved via autoRetrieve.",
    },
    {
      type: "pause",
      message:
        "Look at the 'Memories used' indicator below the AI's response — it shows which memories were automatically retrieved via autoRetrieve, along with their cosine similarity scores.",
    },
    {
      type: "sendMessage",
      message: "A1C is now 6.8! Doctor was really happy.",
      description: "Patient shares improved lab results.",
    },
    {
      type: "waitForReply",
      description:
        "AI references previous A1C of 7.4, diabetes history, and metformin — all from extracted memories.",
    },
    {
      type: "pause",
      message:
        "The AI naturally references the patient's history — diabetes, metformin, the previous A1C of 7.4 — all from extracted memories. This is Vitamem's core value: session-persistent memory with minimal embedding cost.",
    },
  ],
};

// ---------------------------------------------------------------------------
// Scenario 2 — Memory Retrieval Deep Dive
// ---------------------------------------------------------------------------

const retrievalDeepDive: Scenario = {
  id: "retrieval-deep-dive",
  name: "Memory Retrieval Deep Dive",
  description:
    "Explore Vitamem's retrieval pipeline — cosine scoring, memory pinning, and MMR diversity filtering.",
  estimatedTime: "~4 minutes",
  features: [
    "retrieve",
    "pinMemory",
    "unpinMemory",
    "cosine scores",
    "recencyWeight",
    "MMR diversity",
  ],
  steps: [
    {
      type: "pause",
      message:
        "This scenario demonstrates Vitamem's retrieval pipeline. We'll first build up some memories, then explore how search, pinning, and scoring work.",
    },

    // ── Build up memories ──
    {
      type: "sendMessage",
      message:
        "I have Type 2 diabetes, diagnosed 3 years ago. I take metformin 1000mg twice daily.",
      description: "Patient shares core condition and medication.",
    },
    {
      type: "waitForReply",
      description: "AI acknowledges condition and medication details.",
    },
    {
      type: "sendMessage",
      message:
        "I'm allergic to penicillin — found out the hard way last year.",
      description: "Patient reveals a critical drug allergy.",
    },
    {
      type: "waitForReply",
      description: "AI flags the allergy as important.",
    },
    {
      type: "sendMessage",
      message:
        "My blood pressure is 130/85, which my doctor says is a bit high. I also take lisinopril 10mg.",
      description: "Patient adds blood pressure info and another medication.",
    },
    {
      type: "waitForReply",
      description: "AI responds with blood-pressure context.",
    },
    {
      type: "sendMessage",
      message:
        "I try to walk 30 minutes after dinner and do yoga on weekends. I've been reducing sugar intake.",
      description: "Patient describes lifestyle and dietary habits.",
    },
    {
      type: "waitForReply",
      description: "AI encourages the healthy habits.",
    },

    // ── Extract memories ──
    {
      type: "endSession",
      description:
        "Extracting memories from this rich health conversation...",
    },
    {
      type: "pause",
      message:
        "Now let's explore the Memory panel. We have several memories across medications, conditions, and lifestyle.",
    },

    // ── Search & pin demos ──
    {
      type: "searchMemory",
      query: "diabetes medications",
      description:
        "Search for diabetes-related medications — notice the cosine similarity scores next to each result.",
    },
    {
      type: "pause",
      message:
        "The results are ranked by relevance. Now let's pin the allergy memory to see how pinning affects retrieval.",
    },
    {
      type: "pinMemory",
      memoryIndex: 1,
      description:
        "Pinning the penicillin allergy — critical info that should always surface.",
    },
    {
      type: "searchMemory",
      query: "what medications does this patient take?",
      description:
        "Search again — the pinned allergy memory now appears at the top regardless of its cosine score.",
    },
    {
      type: "pause",
      message:
        "Pinned memories are always boosted to the top of retrieval results. This ensures critical information (like allergies) is never missed.",
    },
    {
      type: "unpinMemory",
      memoryIndex: 1,
      description:
        "Unpinning the allergy to show normal ranking again.",
    },
    {
      type: "searchMemory",
      query: "patient health overview",
      description:
        "Broad search to show MMR diversity — notice how similar results are filtered to prevent redundancy.",
    },
    {
      type: "pause",
      message:
        "The retrieval pipeline applies Maximal Marginal Relevance (MMR) to ensure diverse results. Similar memories are grouped rather than repeated.",
    },
  ],
};

// ---------------------------------------------------------------------------
// Scenario 3 — Multi-Session Accumulation
// ---------------------------------------------------------------------------

const multiSession: Scenario = {
  id: "multi-session",
  name: "Multi-Session Accumulation",
  description:
    "See how Vitamem handles overlapping information across sessions — deduplication prevents redundant memories while new facts accumulate cleanly.",
  estimatedTime: "~3 minutes",
  features: ["deduplication", "cross-thread retrieval", "memory accumulation"],
  steps: [
    {
      type: "pause",
      message:
        "This scenario shows how Vitamem handles overlapping information across multiple sessions. Watch how deduplication prevents redundant memories.",
    },

    // ── Session 1 ──
    {
      type: "sendMessage",
      message: "Hi, I have diabetes and take metformin.",
      description: "Session 1 — patient states core facts.",
    },
    {
      type: "waitForReply",
      description: "AI acknowledges the basic health info.",
    },
    {
      type: "endSession",
      description: "Ending session 1 — extracting initial memories.",
    },

    // ── Session 2 ──
    {
      type: "newSession",
      description: "Starting session 2 with some overlapping info.",
    },
    {
      type: "sendMessage",
      message:
        "I'm still taking my metformin twice a day. My doctor added lisinopril for blood pressure.",
      description:
        "Session 2 — repeats metformin, adds new medication.",
    },
    {
      type: "waitForReply",
      description: "AI responds to the medication update.",
    },
    {
      type: "endSession",
      description:
        "Ending session 2 — watch the dedup step in the pipeline. 'Takes metformin' should be recognized as a duplicate and filtered out.",
    },
    {
      type: "pause",
      message:
        "Notice the pipeline showed deduplication filtering! The metformin memory wasn't saved again because cosine similarity with the existing memory exceeded 0.92.",
    },

    // ── Session 3 ──
    {
      type: "newSession",
      description: "Session 3 — more health updates.",
    },
    {
      type: "sendMessage",
      message:
        "Great news — my A1C dropped from 7.4 to 6.8! The metformin and exercise are working.",
      description:
        "Session 3 — shares new lab results while repeating known facts.",
    },
    {
      type: "waitForReply",
      description: "AI celebrates the progress.",
    },
    {
      type: "endSession",
      description:
        "Final extraction — new facts like the A1C improvement are saved, existing ones are deduped.",
    },
    {
      type: "pause",
      message:
        "After 3 sessions, we have a clean, deduplicated memory set. Each unique fact is stored once, even though some were mentioned in multiple sessions. This is Vitamem's efficiency advantage.",
    },
  ],
};

// ---------------------------------------------------------------------------
// Scenario 4 — Thread Lifecycle Automation
// ---------------------------------------------------------------------------

const lifecycleAutomation: Scenario = {
  id: "lifecycle-automation",
  name: "Thread Lifecycle Automation",
  description:
    "Explore thread lifecycle management — sweeping, dormant guards, thread redirection, and closing threads.",
  estimatedTime: "~2 minutes",
  features: [
    "sweepThreads",
    "dormant guard",
    "thread redirect",
    "close thread",
  ],
  steps: [
    {
      type: "pause",
      message:
        "This scenario demonstrates Vitamem's thread lifecycle management — sweeping, dormant guards, and thread redirection.",
    },

    // ── Quick session ──
    {
      type: "sendMessage",
      message:
        "Quick check-in: feeling good today, glucose was 110 fasting.",
      description: "A brief patient check-in message.",
    },
    {
      type: "waitForReply",
      description: "AI acknowledges the glucose reading.",
    },
    {
      type: "endSession",
      description: "Ending this session to make the thread dormant.",
    },

    // ── Dormant guard demo ──
    {
      type: "pause",
      message:
        "The thread is now dormant. What happens if we try to chat on it?",
    },
    {
      type: "sendMessage",
      message: "Hey, one more thing about my glucose readings...",
      description:
        "Attempting to send a message on the dormant thread to trigger the guard.",
    },
    {
      type: "waitForReply",
      description:
        "Vitamem detects the dormant thread and auto-redirects to a new thread.",
    },
    {
      type: "pause",
      message:
        "Notice the redirect banner! Vitamem detected the thread was dormant and automatically created a new thread, preserving the message. The 'previousThreadId' shows where the conversation was redirected from.",
    },
    {
      type: "highlight",
      element: "thread-panel",
      message:
        "The thread list shows both threads — the dormant one and the new active one.",
    },

    // ── Sweep & close ──
    {
      type: "sweepThreads",
      description:
        "Running sweepThreads() — this is typically called on a cron schedule to automatically transition threads based on timeout presets.",
    },
    {
      type: "pause",
      message:
        "sweepThreads processed all threads, transitioning any that exceeded their timeout thresholds. In production, you'd run this periodically.",
    },
    {
      type: "closeThread",
      description:
        "Closing the dormant thread — this is the final lifecycle state.",
    },
    {
      type: "pause",
      message:
        "The thread is now closed and read-only. In production, closed threads can be archived or deleted after the configured timeout. This completes the full lifecycle: Active → Cooling → Dormant → Closed.",
    },
  ],
};

// ---------------------------------------------------------------------------
// Exports
// ---------------------------------------------------------------------------

export const SCENARIOS: Scenario[] = [
  healthCheckin,
  retrievalDeepDive,
  multiSession,
  lifecycleAutomation,
];

export function getDefaultScenario(): Scenario {
  return SCENARIOS[0]; // Health Companion Check-in
}

export function getScenarioById(id: string): Scenario | undefined {
  return SCENARIOS.find((s) => s.id === id);
}
