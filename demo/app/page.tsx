"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Header from "@/components/Header";
import ChatPanel, { type ChatMessage } from "@/components/ChatPanel";
import ThreadPanel, { type ThreadInfo } from "@/components/ThreadPanel";
import PipelineViz, {
  type PipelineState,
  animatePipeline,
} from "@/components/PipelineViz";
import MemoryPanel, {
  type MemoryItem,
  type SearchResult,
} from "@/components/MemoryPanel";
import ConfigSidebar from "@/components/ConfigSidebar";
import ProfileCard from "@/components/ProfileCard";
import type { ConfigResponse } from "@/lib/types";
import type { UserProfile } from "vitamem";
import type { Scenario, ScenarioAction } from "@/lib/scenarios";
import { SCENARIOS } from "@/lib/scenarios";
import * as api from "@/lib/api";
import { sendMessageStream } from "@/lib/api";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

let msgIdCounter = 0;
function nextId() {
  return `msg-${++msgIdCounter}-${Date.now()}`;
}

// ---------------------------------------------------------------------------
// Page component
// ---------------------------------------------------------------------------

export default function DemoPage() {
  // ── Core state ──────────────────────────────────────────────────────────
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [currentThread, setCurrentThread] = useState<ThreadInfo | null>(null);
  const [threads, setThreads] = useState<ThreadInfo[]>([]);
  const [memories, setMemories] = useState<MemoryItem[]>([]);
  const [searchResults, setSearchResults] = useState<SearchResult[]>([]);
  const [config, setConfig] = useState<ConfigResponse | null>(null);
  const [pipeline, setPipeline] = useState<PipelineState | null>(null);
  const [pipelineVisible, setPipelineVisible] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [isSearching, setIsSearching] = useState(false);
  const [configOpen, setConfigOpen] = useState(false);
  const [profile, setProfile] = useState<UserProfile | null>(null);

  // Counters for thread panel
  const [embedCount, setEmbedCount] = useState(0);

  // ── Scenario state ──────────────────────────────────────────────────────
  const [scenarioActive, setScenarioActive] = useState(false);
  const [scenarioSteps, setScenarioSteps] = useState<ScenarioAction[]>([]);
  const [scenarioIndex, setScenarioIndex] = useState(0);
  const [scenarioDescription, setScenarioDescription] = useState<string | null>(null);
  const [currentScenarioIdx, setCurrentScenarioIdx] = useState<number>(-1);
  const [scenarioComplete, setScenarioComplete] = useState(false);

  // Ref for awaiting reply before proceeding
  const awaitingReplyRef = useRef(false);

  // ── Init: fetch config + create first thread ───────────────────────────
  useEffect(() => {
    (async () => {
      try {
        const cfg = await api.getConfig();
        setConfig(cfg);
      } catch {
        /* config fetch is best-effort */
      }
      try {
        const { thread } = await api.createThread();
        const info: ThreadInfo = {
          id: thread.id,
          state: thread.state ?? "active",
        };
        setCurrentThread(info);
        setThreads([info]);
      } catch {
        /* will be created on first message */
      }
      // Load initial profile
      try {
        const { profile: p } = await api.getProfile();
        setProfile(p);
      } catch {
        /* non-critical */
      }
    })();
  }, []);

  // ── Refresh thread list ────────────────────────────────────────────────
  const refreshThreads = useCallback(async () => {
    try {
      const { threads: list } = await api.listThreads();
      setThreads(
        list.map((t) => ({
          id: t.id,
          state: t.state,
          messageCount: t.messageCount,
          createdAt: t.createdAt,
        }))
      );
    } catch {
      /* non-critical */
    }
  }, []);

  // ── Refresh profile ──────────────────────────────────────────────────
  const refreshProfile = useCallback(async () => {
    try {
      const { profile: p } = await api.getProfile();
      setProfile(p);
    } catch {
      /* non-critical */
    }
  }, []);

  // ── Refresh memories ───────────────────────────────────────────────────
  const refreshMemories = useCallback(async () => {
    try {
      const { memories: list } = await api.listMemories();
      setMemories(
        list.map((m) => ({
          id: m.id,
          content: m.content,
          source: m.source,
          tags: m.tags,
          pinned: m.pinned,
          createdAt: m.createdAt,
        }))
      );
    } catch {
      /* non-critical */
    }
  }, []);

  // ── Send message ───────────────────────────────────────────────────────
  const handleSendMessage = useCallback(
    async (text: string) => {
      // Add user message immediately
      const userMsg: ChatMessage = {
        id: nextId(),
        role: "user",
        content: text,
      };
      setMessages((prev) => [...prev, userMsg]);
      setIsLoading(true);

      // Add placeholder assistant message for streaming
      const assistantId = nextId();
      setMessages((prev) => [
        ...prev,
        { id: assistantId, role: "assistant" as const, content: "", isStreaming: true },
      ]);

      try {
        await sendMessageStream(text, currentThread?.id, {
          onMeta: (meta) => {
            // Update thread state
            if (meta.thread) {
              setCurrentThread({ id: meta.thread.id, state: meta.thread.state });
            }
            // Handle redirect
            if (meta.redirected) {
              setMessages((prev) =>
                prev.map((m) =>
                  m.id === assistantId
                    ? { ...m, redirected: true, previousThreadId: meta.previousThreadId }
                    : m
                )
              );
            }
            // Attach memories (badge hidden until streaming completes)
            if (meta.memories) {
              const mapped = meta.memories.map((mem) => ({
                content: mem.content,
                source: mem.source,
                score: mem.score ?? 0,
                tags: mem.tags,
              }));
              setMessages((prev) =>
                prev.map((m) =>
                  m.id === assistantId ? { ...m, memories: mapped } : m
                )
              );
            }
          },
          onDelta: (chunk) => {
            setMessages((prev) =>
              prev.map((m) =>
                m.id === assistantId
                  ? { ...m, content: m.content + chunk }
                  : m
              )
            );
          },
          onDone: () => {
            setMessages((prev) =>
              prev.map((m) =>
                m.id === assistantId ? { ...m, isStreaming: false } : m
              )
            );
            refreshThreads();
          },
          onError: (errMsg) => {
            setMessages((prev) =>
              prev.map((m) =>
                m.id === assistantId
                  ? { ...m, content: `Error: ${errMsg}`, isStreaming: false }
                  : m
              )
            );
          },
        });
      } catch (err) {
        // Network error fallback — try non-streaming
        try {
          const res = await api.sendMessage(text, currentThread?.id);
          setMessages((prev) =>
            prev.map((m) =>
              m.id === assistantId
                ? {
                    ...m,
                    content: res.reply,
                    memories: res.memories,
                    redirected: res.redirected,
                    previousThreadId: res.previousThreadId,
                    isStreaming: false,
                  }
                : m
            )
          );
          if (res.thread) {
            setCurrentThread({ id: res.thread.id, state: res.thread.state });
          }
        } catch (fallbackErr) {
          setMessages((prev) =>
            prev.map((m) =>
              m.id === assistantId
                ? { ...m, content: "Failed to send message", isStreaming: false }
                : m
            )
          );
        }
      } finally {
        setIsLoading(false);
        awaitingReplyRef.current = false;
      }
    },
    [currentThread, refreshThreads]
  );

  // ── End session (trigger dormant) ──────────────────────────────────────
  const handleEndSession = useCallback(async () => {
    if (!currentThread) return;
    setIsLoading(true);
    setPipelineVisible(true);

    try {
      const result = await api.triggerDormant(currentThread.id);

      // Animate pipeline with real data
      await animatePipeline(setPipeline, {
        extractedFacts: result.extractedFacts,
        profileFieldsUpdated: result.profileFieldsUpdated,
        embeddingCount: result.embeddingCount,
        deduplicatedCount: result.deduplicatedCount,
        supersededCount: result.memoriesSuperseded,
        savedCount: result.savedCount,
      });

      setEmbedCount((prev) => prev + result.embeddingCount);

      // Update thread state
      setCurrentThread((prev) =>
        prev ? { ...prev, state: result.thread.state } : prev
      );

      // Refresh data
      await Promise.all([refreshMemories(), refreshThreads(), refreshProfile()]);
    } catch (err) {
      const errorMsg: ChatMessage = {
        id: nextId(),
        role: "assistant",
        content: `Pipeline error: ${err instanceof Error ? err.message : "Unknown error"}`,
      };
      setMessages((prev) => [...prev, errorMsg]);
    } finally {
      setIsLoading(false);
    }
  }, [currentThread, refreshMemories, refreshThreads, refreshProfile]);

  // ── New session ────────────────────────────────────────────────────────
  const handleNewSession = useCallback(async () => {
    setIsLoading(true);
    try {
      const { thread } = await api.createThread();
      const info: ThreadInfo = {
        id: thread.id,
        state: thread.state ?? "active",
      };
      setCurrentThread(info);

      // Add divider in chat
      setMessages((prev) => [
        ...prev,
        { id: nextId(), role: "assistant", content: "__DIVIDER__" },
      ]);

      setPipelineVisible(false);
      setPipeline(null);

      await refreshThreads();
    } catch (err) {
      console.error("Failed to create thread:", err);
    } finally {
      setIsLoading(false);
    }
  }, [refreshThreads]);

  // ── Sweep ──────────────────────────────────────────────────────────────
  const handleSweep = useCallback(async () => {
    setIsLoading(true);
    try {
      await api.sweepThreads();
      await refreshThreads();
    } catch (err) {
      console.error("Sweep failed:", err);
    } finally {
      setIsLoading(false);
    }
  }, [refreshThreads]);

  // ── Close thread ───────────────────────────────────────────────────────
  const handleCloseThread = useCallback(async () => {
    if (!currentThread) return;
    setIsLoading(true);
    try {
      const result = await api.closeThread(currentThread.id);
      setCurrentThread((prev) =>
        prev ? { ...prev, state: result.thread.state } : prev
      );
      await refreshThreads();
    } catch (err) {
      console.error("Close failed:", err);
    } finally {
      setIsLoading(false);
    }
  }, [currentThread, refreshThreads]);

  // ── Memory actions ─────────────────────────────────────────────────────
  const handleSearch = useCallback(async (query: string) => {
    setIsSearching(true);
    try {
      const { results } = await api.searchMemories(query);
      setSearchResults(results);
    } catch (err) {
      console.error("Search failed:", err);
    } finally {
      setIsSearching(false);
    }
  }, []);

  const handleClearSearch = useCallback(() => {
    setSearchResults([]);
  }, []);

  const handlePin = useCallback(
    async (memoryId: string) => {
      try {
        await api.pinMemory(memoryId);
        await refreshMemories();
      } catch (err) {
        console.error("Pin failed:", err);
      }
    },
    [refreshMemories]
  );

  const handleUnpin = useCallback(
    async (memoryId: string) => {
      try {
        await api.unpinMemory(memoryId);
        await refreshMemories();
      } catch (err) {
        console.error("Unpin failed:", err);
      }
    },
    [refreshMemories]
  );

  const handleDelete = useCallback(
    async (memoryId: string) => {
      try {
        await api.deleteMemory(memoryId);
        await refreshMemories();
      } catch (err) {
        console.error("Delete failed:", err);
      }
    },
    [refreshMemories]
  );

  // ── Scenario runner ────────────────────────────────────────────────────
  const handleSelectScenario = useCallback((scenario: Scenario) => {
    const idx = SCENARIOS.findIndex((s) => s.id === scenario.id);
    setCurrentScenarioIdx(idx);
    setScenarioComplete(false);
    setScenarioActive(true);
    setScenarioSteps(scenario.steps);
    setScenarioIndex(0);
    setScenarioDescription(scenario.description);
    // Reset state for new scenario
    setMessages([]);
    setPipelineVisible(false);
    setPipeline(null);
  }, []);

  const handleSkipScenario = useCallback(() => {
    setScenarioActive(false);
    setScenarioComplete(false);
    setScenarioSteps([]);
    setScenarioIndex(0);
    setScenarioDescription(null);
  }, []);

  const executeScenarioStep = useCallback(
    async (step: ScenarioAction) => {
      switch (step.type) {
        case "sendMessage":
          setScenarioDescription(step.description ?? null);
          await handleSendMessage(step.message);
          break;

        case "waitForReply":
          setScenarioDescription(step.description ?? null);
          // Reply already handled by sendMessage, just pause briefly
          await new Promise((r) => setTimeout(r, 500));
          break;

        case "endSession":
          setScenarioDescription(step.description);
          await handleEndSession();
          break;

        case "newSession":
          setScenarioDescription(step.description);
          await handleNewSession();
          break;

        case "searchMemory":
          setScenarioDescription(step.description);
          await handleSearch(step.query);
          break;

        case "pinMemory": {
          setScenarioDescription(step.description);
          const pinTarget = memories[step.memoryIndex];
          if (pinTarget) await handlePin(pinTarget.id);
          break;
        }

        case "unpinMemory": {
          setScenarioDescription(step.description);
          const unpinTarget = memories[step.memoryIndex];
          if (unpinTarget) await handleUnpin(unpinTarget.id);
          break;
        }

        case "sweepThreads":
          setScenarioDescription(step.description);
          await handleSweep();
          break;

        case "closeThread":
          setScenarioDescription(step.description);
          await handleCloseThread();
          break;

        case "pause":
          setScenarioDescription(step.message);
          // Wait for user to click Next
          return;

        case "highlight":
          setScenarioDescription(step.message);
          // Add highlight class to target element
          const el = document.getElementById(step.element);
          if (el) {
            el.classList.add("demo-highlight");
            setTimeout(() => el.classList.remove("demo-highlight"), 4500);
          }
          return;
      }
    },
    [
      handleSendMessage,
      handleEndSession,
      handleNewSession,
      handleSearch,
      handlePin,
      handleUnpin,
      handleSweep,
      handleCloseThread,
      memories,
    ]
  );

  const handleNextStep = useCallback(async () => {
    if (!scenarioActive || scenarioIndex >= scenarioSteps.length) {
      // Scenario complete — show transition card
      setScenarioActive(false);
      setScenarioComplete(true);
      setScenarioDescription(null);
      return;
    }

    const step = scenarioSteps[scenarioIndex];
    let nextIdx = scenarioIndex + 1;
    setScenarioIndex(nextIdx);
    await executeScenarioStep(step);

    // Auto-advance through waitForReply steps (no extra click needed)
    while (
      nextIdx < scenarioSteps.length &&
      scenarioSteps[nextIdx].type === "waitForReply"
    ) {
      const waitStep = scenarioSteps[nextIdx];
      nextIdx += 1;
      setScenarioIndex(nextIdx);
      await executeScenarioStep(waitStep);
    }
  }, [scenarioActive, scenarioIndex, scenarioSteps, executeScenarioStep]);

  const handleNextScenario = useCallback(() => {
    const nextIdx = currentScenarioIdx + 1;
    if (nextIdx < SCENARIOS.length) {
      const scenario = SCENARIOS[nextIdx];
      // Preserve Vitamem instance & memories — only clear UI state
      setCurrentScenarioIdx(nextIdx);
      setScenarioComplete(false);
      setScenarioActive(true);
      setScenarioSteps(scenario.steps);
      setScenarioIndex(0);
      setScenarioDescription(scenario.description);
      setMessages([]);
      setPipelineVisible(false);
      setPipeline(null);
    }
  }, [currentScenarioIdx]);

  const handleRestartDemos = useCallback(() => {
    handleSelectScenario(SCENARIOS[0]);
  }, [handleSelectScenario]);

  const handleContinueChatting = useCallback(() => {
    setScenarioComplete(false);
    setScenarioDescription(null);
  }, []);

  // Computed: next scenario name (if any)
  const nextScenario = currentScenarioIdx >= 0 && currentScenarioIdx < SCENARIOS.length - 1
    ? SCENARIOS[currentScenarioIdx + 1]
    : null;

  // ── Computed values ────────────────────────────────────────────────────
  const messageCount = messages.filter(
    (m) => m.content !== "__DIVIDER__"
  ).length;

  // ── Render ─────────────────────────────────────────────────────────────
  return (
    <div className="min-h-screen bg-[var(--slate-dk)] text-[var(--snow)]">
      <Header
        config={config}
        onSelectScenario={handleSelectScenario}
        onToggleConfig={() => setConfigOpen((o) => !o)}
        scenarioActive={scenarioActive}
      />

      <main className="max-w-[1200px] mx-auto px-4 sm:px-6 py-6">
        <div className="grid grid-cols-1 md:grid-cols-[1fr_340px] gap-4 items-start">
          {/* Left column: Chat */}
          <ChatPanel
            messages={messages}
            isLoading={isLoading}
            onSendMessage={handleSendMessage}
            scenarioActive={scenarioActive}
            scenarioStepDescription={scenarioDescription}
            onNextStep={handleNextStep}
            onSkipScenario={handleSkipScenario}
            threadState={currentThread?.state ?? "active"}
            scenarioComplete={scenarioComplete}
            currentScenarioIdx={currentScenarioIdx}
            totalScenarios={SCENARIOS.length}
            currentScenarioName={currentScenarioIdx >= 0 ? SCENARIOS[currentScenarioIdx]?.name : undefined}
            nextScenarioName={nextScenario?.name}
            nextScenarioDescription={nextScenario?.description}
            onNextScenario={handleNextScenario}
            onRestartDemos={handleRestartDemos}
            onContinueChatting={handleContinueChatting}
            scenarioStepIndex={scenarioIndex}
            scenarioTotalSteps={scenarioSteps.length}
          />

          {/* Right column */}
          <div className="flex flex-col gap-3">
            <ThreadPanel
              currentThread={currentThread}
              threads={threads}
              messageCount={messageCount}
              memoryCount={memories.length}
              embedCount={embedCount}
              onEndSession={handleEndSession}
              onNewSession={handleNewSession}
              onSweep={handleSweep}
              onCloseThread={handleCloseThread}
              isLoading={isLoading}
            />

            <PipelineViz pipeline={pipeline} visible={pipelineVisible} />

            <ProfileCard profile={profile} />

            <MemoryPanel
              memories={memories}
              searchResults={searchResults}
              onSearch={handleSearch}
              onClearSearch={handleClearSearch}
              onPin={handlePin}
              onUnpin={handleUnpin}
              onDelete={handleDelete}
              isSearching={isSearching}
            />
          </div>
        </div>
      </main>

      <ConfigSidebar
        config={config}
        open={configOpen}
        onClose={() => setConfigOpen(false)}
      />
    </div>
  );
}
