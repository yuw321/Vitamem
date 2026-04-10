"use client";

import { SCENARIOS, type Scenario } from "@/lib/scenarios";
import type { ConfigResponse } from "@/lib/types";

interface HeaderProps {
  config: ConfigResponse | null;
  onSelectScenario: (scenario: Scenario) => void;
  onToggleConfig: () => void;
  scenarioActive: boolean;
}

export default function Header({
  config,
  onSelectScenario,
  onToggleConfig,
  scenarioActive,
}: HeaderProps) {
  return (
    <header className="sticky top-0 z-50 bg-[rgba(15,23,42,0.92)] backdrop-blur-xl border-b border-white/[0.08]">
      <div className="max-w-[1200px] mx-auto px-4 sm:px-6 h-14 flex items-center justify-between">
        {/* Logo */}
        <div className="flex items-center gap-2.5">
          <span className="text-lg font-bold tracking-tight text-[var(--snow)]">
            vita<span className="text-[var(--teal-lt)]">mem</span>
          </span>
          <span className="hidden sm:inline-block text-[10px] font-semibold uppercase tracking-widest text-[var(--teal-lt)] bg-[var(--teal-glow)] border border-[rgba(20,184,166,0.2)] px-2 py-0.5 rounded-full">
            Live Demo
          </span>
        </div>

        {/* Right controls */}
        <div className="flex items-center gap-2">
          {/* Guided demo dropdown */}
          <div className="relative group">
            <button
              className={`text-xs font-semibold px-3 py-1.5 rounded-lg border transition-colors ${
                scenarioActive
                  ? "text-[var(--teal-lt)] bg-[var(--teal-glow)] border-[rgba(20,184,166,0.3)]"
                  : "text-[var(--silver)] bg-[rgba(255,255,255,0.04)] border-[var(--border)] hover:text-[var(--snow)] hover:bg-[rgba(255,255,255,0.08)]"
              }`}
            >
              Guided Demo ▾
            </button>
            <div className="absolute right-0 mt-1 w-72 bg-[var(--slate)] border border-[var(--border)] rounded-xl shadow-xl opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-all duration-150 z-50">
              {SCENARIOS.map((s) => (
                <button
                  key={s.id}
                  onClick={() => onSelectScenario(s)}
                  className="w-full text-left px-4 py-3 hover:bg-[rgba(255,255,255,0.04)] first:rounded-t-xl last:rounded-b-xl transition-colors"
                >
                  <div className="text-xs font-semibold text-[var(--snow)]">
                    {s.name}
                  </div>
                  <div className="text-[11px] text-[var(--silver)] mt-0.5">
                    {s.description.slice(0, 80)}…
                  </div>
                  <div className="text-[10px] text-[var(--teal-lt)] mt-1">
                    {s.estimatedTime} · {s.features.slice(0, 3).join(", ")}
                  </div>
                </button>
              ))}
            </div>
          </div>

          {/* Provider badge */}
          {config && (
            <span className="hidden sm:inline-block text-[10px] font-semibold text-[var(--silver)] bg-[rgba(255,255,255,0.04)] border border-[var(--border)] px-2 py-1 rounded-md">
              {config.provider} · {config.preset}
            </span>
          )}

          {/* Config toggle */}
          <button
            onClick={onToggleConfig}
            className="text-[var(--silver)] hover:text-[var(--snow)] transition-colors p-1.5 rounded-lg hover:bg-[rgba(255,255,255,0.06)]"
            title="Configuration"
          >
            <svg
              className="w-4 h-4"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.066 2.573c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.573 1.066c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.066-2.573c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z"
              />
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"
              />
            </svg>
          </button>
        </div>
      </div>
    </header>
  );
}
