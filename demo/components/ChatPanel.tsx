"use client";

import { useEffect, useRef, useState } from "react";
import ReactMarkdown from "react-markdown";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface ChatMessage {
  id: string;
  role: "user" | "assistant";
  content: string;
  memories?: Array<{ content: string; source: string; score: number; tags?: string[] }>;
  redirected?: boolean;
  previousThreadId?: string;
  isStreaming?: boolean;
}

interface ChatPanelProps {
  messages: ChatMessage[];
  isLoading: boolean;
  onSendMessage: (message: string) => void;
  scenarioActive: boolean;
  scenarioStepDescription: string | null;
  onNextStep: () => void;
  onSkipScenario: () => void;
  threadState: string;
  scenarioComplete: boolean;
  currentScenarioIdx: number;
  totalScenarios: number;
  currentScenarioName?: string;
  nextScenarioName?: string;
  nextScenarioDescription?: string;
  onNextScenario: () => void;
  onRestartDemos: () => void;
  onContinueChatting: () => void;
  scenarioStepIndex: number;
  scenarioTotalSteps: number;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export default function ChatPanel({
  messages,
  isLoading,
  onSendMessage,
  scenarioActive,
  scenarioStepDescription,
  onNextStep,
  onSkipScenario,
  threadState,
  scenarioComplete,
  currentScenarioIdx,
  totalScenarios,
  currentScenarioName,
  nextScenarioName,
  nextScenarioDescription,
  onNextScenario,
  onRestartDemos,
  onContinueChatting,
  scenarioStepIndex,
  scenarioTotalSteps,
}: ChatPanelProps) {
  const [input, setInput] = useState("");
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  // Auto-scroll to bottom on new messages
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, isLoading, scenarioComplete]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const text = input.trim();
    if (!text || isLoading) return;
    setInput("");
    onSendMessage(text);
  };

  const stateColor = {
    active: "bg-[rgba(34,197,94,0.15)] text-[#22c55e] border-[rgba(34,197,94,0.3)]",
    cooling: "bg-[rgba(245,158,11,0.15)] text-[#f59e0b] border-[rgba(245,158,11,0.3)]",
    dormant: "bg-[rgba(148,163,184,0.1)] text-[var(--silver)] border-[rgba(148,163,184,0.2)]",
    closed: "bg-[rgba(100,116,139,0.1)] text-[#64748b] border-[rgba(100,116,139,0.2)]",
  }[threadState] ?? "bg-[var(--teal-glow)] text-[var(--teal-lt)] border-[rgba(20,184,166,0.3)]";

  return (
    <div
      id="chat-panel"
      className="bg-[var(--slate)] border border-[var(--border)] rounded-2xl overflow-hidden flex flex-col h-full"
    >
      {/* Header */}
      <div className="px-5 py-3.5 border-b border-[var(--border)] flex items-center justify-between shrink-0">
        <div className="flex items-center gap-2">
          <span className="text-sm font-semibold text-[var(--snow)]">
            Health Companion
          </span>
          <span
            className={`text-[11px] font-bold uppercase tracking-wide px-2.5 py-0.5 rounded-full border ${stateColor}`}
          >
            {threadState}
          </span>
        </div>
      </div>

      {/* Scenario step description banner */}
      {scenarioActive && scenarioStepDescription && (
        <div className="px-5 py-2.5 bg-[rgba(20,184,166,0.06)] border-b border-[rgba(20,184,166,0.1)] text-xs text-[var(--teal-lt)] font-medium animate-fade-in flex items-center justify-between">
          <span>{scenarioStepDescription}</span>
          {currentScenarioIdx >= 0 && (
            <span className="text-[10px] font-bold uppercase tracking-wider text-[var(--silver)] ml-3 shrink-0">
              Demo {currentScenarioIdx + 1} of {totalScenarios}
            </span>
          )}
        </div>
      )}

      {/* Messages */}
      <div
        ref={containerRef}
        className="flex-1 overflow-y-auto px-5 py-5 flex flex-col gap-4 min-h-[300px] max-h-[65vh]"
      >
        {messages.length === 0 && !isLoading && (
          <div className="flex-1 flex items-center justify-center text-sm text-[var(--silver)] text-center py-12">
            <div>
              <div className="text-3xl mb-3">💬</div>
              <div>Send a message or start a guided demo.</div>
            </div>
          </div>
        )}

        {messages.map((msg) => (
          <MessageBubble key={msg.id} message={msg} />
        ))}

        {/* Typing indicator — only show when loading and no streaming message yet */}
        {isLoading && !messages.some((m) => m.isStreaming) && (
          <div className="flex gap-2.5 items-start animate-msg-in">
            <div className="w-[30px] h-[30px] rounded-full shrink-0 flex items-center justify-center text-xs font-bold bg-[var(--teal-glow)] text-[var(--teal-lt)] border border-[rgba(20,184,166,0.2)]">
              V
            </div>
            <div className="flex items-center gap-[5px] px-3.5 py-3 bg-[rgba(255,255,255,0.04)] border border-[var(--border)] rounded-xl rounded-bl-sm">
              <div className="typing-dot" />
              <div className="typing-dot" />
              <div className="typing-dot" />
            </div>
          </div>
        )}

        {/* Scenario transition card */}
        {scenarioComplete && (
          <ScenarioTransitionCard
            currentScenarioIdx={currentScenarioIdx}
            totalScenarios={totalScenarios}
            currentScenarioName={currentScenarioName}
            nextScenarioName={nextScenarioName}
            nextScenarioDescription={nextScenarioDescription}
            onNextScenario={onNextScenario}
            onRestartDemos={onRestartDemos}
            onContinueChatting={onContinueChatting}
          />
        )}

        <div ref={messagesEndRef} />
      </div>

      {/* Input / guided demo controls */}
      <div className="px-5 py-3.5 border-t border-[var(--border)] shrink-0">
        {scenarioActive ? (
          <div className="flex flex-col gap-2">
            {/* Progress indicator */}
            {currentScenarioIdx >= 0 && (
              <div className="flex flex-col gap-1.5">
                <div className="flex items-center justify-between">
                  <span className="text-[11px] font-semibold text-[var(--snow)] tracking-wide">
                    Step {scenarioStepIndex} of {scenarioTotalSteps}
                  </span>
                  <span className="text-[11px] font-semibold text-[var(--silver)] tracking-wide">
                    Demo {currentScenarioIdx + 1} of {totalScenarios} — {currentScenarioName}
                  </span>
                </div>
                {/* Thin progress bar */}
                <div className="w-full h-[3px] rounded-full bg-[rgba(255,255,255,0.06)] overflow-hidden">
                  <div
                    className="h-full rounded-full bg-[var(--teal)] transition-all duration-300 ease-out"
                    style={{ width: scenarioTotalSteps > 0 ? `${(scenarioStepIndex / scenarioTotalSteps) * 100}%` : '0%' }}
                  />
                </div>
              </div>
            )}
            <div className="flex gap-2">
              <button
                onClick={onNextStep}
                disabled={isLoading}
                className="flex-1 flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg text-sm font-semibold bg-[var(--teal)] text-white hover:bg-[var(--teal-mid)] disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
              >
                ▶ Next Step
              </button>
              <button
                onClick={onSkipScenario}
                className="px-4 py-2.5 rounded-lg text-sm font-semibold text-[var(--silver)] bg-[rgba(255,255,255,0.06)] border border-[var(--border)] hover:bg-[rgba(255,255,255,0.1)] hover:text-[var(--snow)] transition-colors"
              >
                Skip
              </button>
            </div>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="flex gap-2">
            <input
              id="chat-input"
              type="text"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder="Type a message…"
              disabled={isLoading}
              className="flex-1 bg-[rgba(255,255,255,0.04)] border border-[var(--border)] rounded-lg px-4 py-2.5 text-sm text-[var(--snow)] placeholder:text-[var(--silver)] outline-none focus:border-[rgba(20,184,166,0.4)] focus:ring-1 focus:ring-[rgba(20,184,166,0.2)] transition-all disabled:opacity-40"
            />
            <button
              type="submit"
              disabled={isLoading || !input.trim()}
              className="px-5 py-2.5 rounded-lg text-sm font-semibold bg-[var(--teal)] text-white hover:bg-[var(--teal-mid)] disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
            >
              Send
            </button>
          </form>
        )}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Scenario transition card sub-component
// ---------------------------------------------------------------------------

function ScenarioTransitionCard({
  currentScenarioIdx,
  totalScenarios,
  currentScenarioName,
  nextScenarioName,
  nextScenarioDescription,
  onNextScenario,
  onRestartDemos,
  onContinueChatting,
}: {
  currentScenarioIdx: number;
  totalScenarios: number;
  currentScenarioName?: string;
  nextScenarioName?: string;
  nextScenarioDescription?: string;
  onNextScenario: () => void;
  onRestartDemos: () => void;
  onContinueChatting: () => void;
}) {
  const isLast = currentScenarioIdx >= totalScenarios - 1;
  const demoNumber = currentScenarioIdx + 1;

  if (isLast) {
    return (
      <div className="mx-auto w-full max-w-[420px] animate-msg-in">
        <div className="rounded-xl border border-[rgba(34,197,94,0.25)] bg-[rgba(34,197,94,0.06)] p-5">
          <div className="flex items-center gap-2 mb-3">
            <span className="text-[#22c55e] text-lg">✓</span>
            <span className="text-sm font-bold text-[#22c55e]">
              All {totalScenarios} demos complete!
            </span>
          </div>
          <p className="text-xs text-[var(--silver)] leading-relaxed mb-4">
            You&apos;ve seen all core Vitamem features. Continue chatting freely or
            restart any demo from the Guided Demo menu above.
          </p>
          <div className="flex gap-2">
            <button
              onClick={onRestartDemos}
              className="flex-1 px-4 py-2 rounded-lg text-xs font-semibold bg-[var(--teal)] text-white hover:bg-[var(--teal-mid)] transition-colors"
            >
              Restart Demos
            </button>
            <button
              onClick={onContinueChatting}
              className="flex-1 px-4 py-2 rounded-lg text-xs font-semibold text-[var(--silver)] bg-[rgba(255,255,255,0.06)] border border-[var(--border)] hover:bg-[rgba(255,255,255,0.1)] hover:text-[var(--snow)] transition-colors"
            >
              Continue Chatting
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto w-full max-w-[420px] animate-msg-in">
      <div className="rounded-xl border border-[rgba(20,184,166,0.25)] bg-[rgba(20,184,166,0.06)] p-5">
        <div className="flex items-center gap-2 mb-3">
          <span className="text-[var(--teal-lt)] text-lg">✓</span>
          <span className="text-sm font-bold text-[var(--teal-lt)]">
            Demo {demoNumber} of {totalScenarios} complete
          </span>
        </div>
        <div className="mb-1 text-sm font-semibold text-[var(--snow)]">
          Next: {nextScenarioName}
        </div>
        {nextScenarioDescription && (
          <p className="text-xs text-[var(--silver)] leading-relaxed mb-4">
            {nextScenarioDescription}
          </p>
        )}
        <button
          onClick={onNextScenario}
          className="w-full px-4 py-2.5 rounded-lg text-sm font-semibold bg-[var(--teal)] text-white hover:bg-[var(--teal-mid)] transition-colors"
        >
          Continue to Next Demo →
        </button>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Message bubble sub-component
// ---------------------------------------------------------------------------

function MessageBubble({ message }: { message: ChatMessage }) {
  const [showMemories, setShowMemories] = useState(false);
  const isUser = message.role === "user";

  // Session divider
  if (message.content === "__DIVIDER__") {
    return (
      <div className="relative text-center text-[11px] text-[var(--teal-lt)] font-semibold uppercase tracking-wider py-2">
        <div className="absolute top-1/2 left-0 right-0 h-px bg-[rgba(20,184,166,0.2)]" />
        <span className="relative z-10 bg-[var(--slate)] px-3">
          New Session — memories retrieved
        </span>
      </div>
    );
  }

  return (
    <div
      className={`flex gap-2.5 items-start animate-msg-in ${isUser ? "flex-row-reverse" : ""}`}
    >
      {/* Avatar */}
      <div
        className={`w-[30px] h-[30px] rounded-full shrink-0 flex items-center justify-center text-xs font-bold ${
          isUser
            ? "bg-[rgba(148,163,184,0.1)] text-[var(--silver)] border border-white/[0.08]"
            : "bg-[var(--teal-glow)] text-[var(--teal-lt)] border border-[rgba(20,184,166,0.2)]"
        }`}
      >
        {isUser ? "U" : "V"}
      </div>

      {/* Bubble */}
      <div className="max-w-[75%] flex flex-col gap-1.5">
        {/* Redirect banner */}
        {message.redirected && (
          <div className="text-[11px] font-semibold text-[#f59e0b] bg-[rgba(245,158,11,0.08)] border border-[rgba(245,158,11,0.2)] rounded-lg px-3 py-1.5 mb-1">
            ↪ Redirected from thread {message.previousThreadId?.slice(0, 8)}…
          </div>
        )}

        <div
          className={`px-3.5 py-2.5 rounded-xl text-sm leading-relaxed ${
            isUser
              ? "bg-[var(--teal-glow)] border border-[rgba(20,184,166,0.2)] rounded-br-sm text-[var(--snow)]"
              : "bg-[rgba(255,255,255,0.04)] border border-[var(--border)] rounded-bl-sm text-[var(--snow)]"
          }`}
        >
          {isUser ? (
            message.content
          ) : (
            <div className="markdown-body">
              <ReactMarkdown>{message.content}</ReactMarkdown>
            </div>
          )}
          {message.isStreaming && (
            <span className="streaming-cursor">▊</span>
          )}
        </div>

        {/* Memories used badge — only after streaming completes */}
        {!isUser && message.memories && message.memories.length > 0 && !message.isStreaming && (
          <div>
            <button
              onClick={() => setShowMemories(!showMemories)}
              className="text-[11px] font-semibold text-[var(--teal-lt)] bg-[var(--teal-glow)] border border-[rgba(20,184,166,0.2)] rounded-full px-2.5 py-0.5 hover:bg-[rgba(15,118,110,0.25)] transition-colors"
            >
              {showMemories ? "▾" : "▸"} Memories used ({message.memories.length})
            </button>
            {showMemories && (
              <div className="mt-2 flex flex-col gap-1.5 animate-fade-in">
                {message.memories.map((mem, i) => (
                  <div
                    key={i}
                    className="text-[11px] px-3 py-2 bg-[rgba(255,255,255,0.02)] border border-[var(--border)] rounded-lg"
                  >
                    <div className="text-[var(--snow)] leading-relaxed">
                      {mem.content}
                    </div>
                    <div className="flex items-center gap-2 mt-1.5">
                      <span className="font-bold text-[var(--teal-lt)] bg-[var(--teal-glow)] px-1.5 py-0.5 rounded">
                        {mem.score.toFixed(2)}
                      </span>
                      <span
                        className={`font-bold uppercase tracking-wider px-1.5 py-0.5 rounded ${
                          mem.source === "confirmed"
                            ? "text-[#22c55e] bg-[rgba(34,197,94,0.1)]"
                            : "text-[#f59e0b] bg-[rgba(245,158,11,0.1)]"
                        }`}
                      >
                        {mem.source}
                      </span>
                      {mem.tags?.map((tag) => (
                        <span
                          key={tag}
                          className="text-[var(--silver)] bg-[rgba(255,255,255,0.04)] px-1.5 py-0.5 rounded"
                        >
                          {tag}
                        </span>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
