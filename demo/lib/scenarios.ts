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
    "The patient's first appointment — watch how Vitamem captures their health story through chat, extracts structured memories, and auto-pins critical safety information.",
  estimatedTime: "~3 minutes",
  features: ["chat", "extraction", "source classification", "auto-pin"],
  steps: [
    {
      type: "pause",
      message:
        "Meet your patient. They're visiting for the first time — let's see how Vitamem captures their health story.",
    },
    {
      type: "sendMessage",
      message:
        "Hi! I've been managing Type 2 diabetes for about 3 years now. I take metformin 1000mg twice a day.",
      description: "Patient introduces their condition and medication.",
    },
    {
      type: "waitForReply",
      description: "AI acknowledges the health background.",
    },
    {
      type: "sendMessage",
      message:
        "I'm also allergic to penicillin — found out the hard way last year. My last A1C was 7.4% and my doctor wants me under 7.0.",
      description: "Patient shares allergy and lab results.",
    },
    {
      type: "waitForReply",
      description: "AI responds to allergy and A1C information.",
    },
    {
      type: "sendMessage",
      message:
        "I exercise Monday, Wednesday, Friday and I've been cutting carbs to help get that number down.",
      description: "Patient shares lifestyle and goals.",
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
      element: "memory-panel",
      message:
        "Vitamem extracted the key facts from the conversation. Notice the pin icons — the allergy and medication dosage were auto-pinned as safety-critical. The source badges show 'confirmed' for things the patient stated directly.",
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
    "The patient returns for a follow-up visit. Watch how Vitamem automatically retrieves memories from the first visit and updates the A1C value in-place when it changes.",
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
        "The patient returns for a follow-up. Vitamem still has their memories from the first visit — watch how the AI uses them.",
    },
    {
      type: "newSession",
      description: "Starting a new session for the follow-up visit.",
    },
    {
      type: "sendMessage",
      message: "Hey, I'm back! Had my checkup yesterday.",
      description: "Patient returns for follow-up.",
    },
    {
      type: "waitForReply",
      description:
        "AI responds using autoRetrieve — references diabetes, metformin, and other memories.",
    },
    {
      type: "pause",
      message:
        "See the 'Memories used' section under the AI's reply? Expand it. Those are memories from Demo 1 that Vitamem automatically retrieved — it embedded your message, searched for similar memories using vector similarity, and injected them into the AI's context. The scores show how relevant each memory was. The AI didn't 'remember' anything — it was given these facts as context.",
    },
    {
      type: "sendMessage",
      message:
        "Great news — my A1C came back at 6.8%! Down from 7.4! The diet and exercise changes are really paying off.",
      description: "Patient reports improved A1C.",
    },
    {
      type: "waitForReply",
      description:
        "AI celebrates the improvement, referencing the previous A1C.",
    },
    {
      type: "pause",
      message:
        "The AI mentioned the previous A1C of 7.4% — that came directly from the retrieved memories. Expand 'Memories used' again to see which memories were pulled in. Without autoRetrieve, the AI would have no idea about the patient's history. Now let's end this session and watch what happens to the A1C memory in the panel.",
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
        "Your patient's data is safe in memory. Now let's look at how Vitamem manages conversation threads over time.",
    },
    {
      type: "sendMessage",
      message:
        "Quick question — should I take my metformin with food or on an empty stomach?",
      description: "Patient asks a quick question.",
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
        "The thread is now dormant and memories have been extracted. What happens if the patient comes back to this same thread?",
    },
    {
      type: "sendMessage",
      message: "Oh wait, one more thing about my medication...",
      description:
        "Patient tries to continue on the dormant thread.",
    },
    {
      type: "waitForReply",
      description:
        "Vitamem detects the dormant thread and auto-redirects to a new one.",
    },
    {
      type: "pause",
      message:
        "Vitamem detected the dormant thread and automatically created a new one. The patient's message was preserved — no data lost. Look at the thread list to see both threads.",
    },
    {
      type: "sweepThreads",
      description:
        "Running sweepThreads — processes all threads based on timeout settings.",
    },
    {
      type: "pause",
      message:
        "sweepThreads processes all threads based on timeout settings. In production, you'd run this on a schedule (cron job or setInterval). Threads transition: Active → Cooling → Dormant → Closed.",
    },
  ],
};

// ---------------------------------------------------------------------------
// Exports
// ---------------------------------------------------------------------------

export const SCENARIOS: Scenario[] = [firstVisit, theFollowup, threadLifecycle];

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
