"use client";

import { useState, useMemo } from "react";

export interface MemoryItem {
  id: string;
  content: string;
  source: string;
  tags?: string[];
  pinned?: boolean;
  createdAt?: string;
  lastRetrievedAt?: string;
  retrievalCount?: number;
  priority?: "CRITICAL" | "IMPORTANT" | "INFO";
}

export interface SearchResult {
  content: string;
  source: string;
  score: number;
  pinned?: boolean;
  tags?: string[];
}

interface MemoryPanelProps {
  memories: MemoryItem[];
  searchResults: SearchResult[];
  onSearch: (query: string) => void;
  onClearSearch: () => void;
  onPin: (memoryId: string) => void;
  onUnpin: (memoryId: string) => void;
  onDelete: (memoryId: string) => void;
  isSearching: boolean;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Parse `(mentioned YYYY-MM-DD)` out of content and return segments. */
function parseTemporalContent(
  content: string
): Array<{ type: "text"; value: string } | { type: "date"; value: string }> {
  const regex = /\(mentioned (\d{4}-\d{2}-\d{2})\)/g;
  const segments: Array<
    { type: "text"; value: string } | { type: "date"; value: string }
  > = [];
  let lastIndex = 0;
  let match: RegExpExecArray | null;

  while ((match = regex.exec(content)) !== null) {
    if (match.index > lastIndex) {
      segments.push({ type: "text", value: content.slice(lastIndex, match.index) });
    }
    segments.push({ type: "date", value: match[1] });
    lastIndex = regex.lastIndex;
  }
  if (lastIndex < content.length) {
    segments.push({ type: "text", value: content.slice(lastIndex) });
  }
  return segments;
}

/** Format a date string as relative time (e.g. "2d ago"). */
function relativeTime(dateStr: string): string {
  const now = Date.now();
  const then = new Date(dateStr).getTime();
  const diffMs = now - then;
  if (diffMs < 0) return "just now";
  const mins = Math.floor(diffMs / 60_000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 30) return `${days}d ago`;
  const months = Math.floor(days / 30);
  return `${months}mo ago`;
}

/** Format YYYY-MM-DD into a short readable date. */
function formatDateChip(iso: string): string {
  const d = new Date(iso + "T00:00:00");
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

/** Group memories by month/year, sorted ascending. */
function groupByMonth(
  memories: MemoryItem[]
): Array<{ label: string; sortKey: string; items: MemoryItem[] }> {
  const sorted = [...memories].sort((a, b) => {
    const da = a.createdAt ? new Date(a.createdAt).getTime() : 0;
    const db = b.createdAt ? new Date(b.createdAt).getTime() : 0;
    return da - db;
  });

  const groups: Map<string, { label: string; sortKey: string; items: MemoryItem[] }> = new Map();

  for (const m of sorted) {
    let key = "Unknown";
    let label = "Unknown Date";
    if (m.createdAt) {
      const d = new Date(m.createdAt);
      key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
      label = d.toLocaleDateString("en-US", { month: "long", year: "numeric" });
    }
    if (!groups.has(key)) {
      groups.set(key, { label, sortKey: key, items: [] });
    }
    groups.get(key)!.items.push(m);
  }

  return Array.from(groups.values()).sort((a, b) =>
    a.sortKey.localeCompare(b.sortKey)
  );
}

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

function PriorityBadge({ priority }: { priority: MemoryItem["priority"] }) {
  if (!priority) return null;

  const styles: Record<string, string> = {
    CRITICAL:
      "bg-[rgba(244,63,94,0.12)] text-[#f43f5e] border-[rgba(244,63,94,0.25)]",
    IMPORTANT:
      "bg-[rgba(245,158,11,0.12)] text-[#f59e0b] border-[rgba(245,158,11,0.25)]",
    INFO: "bg-[rgba(148,163,184,0.1)] text-[var(--silver)] border-[rgba(148,163,184,0.15)]",
  };

  return (
    <span
      className={`text-[9px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded border leading-none shrink-0 ${styles[priority]}`}
    >
      {priority}
    </span>
  );
}

function TemporalContent({ content }: { content: string }) {
  const segments = parseTemporalContent(content);
  if (segments.length === 1 && segments[0].type === "text") {
    return <>{content}</>;
  }
  return (
    <>
      {segments.map((seg, i) =>
        seg.type === "date" ? (
          <span
            key={i}
            className="inline-flex items-center gap-0.5 text-[10px] font-medium text-[var(--teal-lt)] bg-[var(--teal-glow)] border border-[rgba(20,184,166,0.15)] px-1.5 py-0.5 rounded-full mx-0.5 align-baseline"
          >
            <span className="text-[9px]">📅</span>
            {formatDateChip(seg.value)}
          </span>
        ) : (
          <span key={i}>{seg.value}</span>
        )
      )}
    </>
  );
}

function DecayInfo({
  retrievalCount,
  lastRetrievedAt,
}: {
  retrievalCount?: number;
  lastRetrievedAt?: string;
}) {
  const count = retrievalCount ?? 0;
  return (
    <span className="inline-flex items-center gap-1.5 text-[10px] text-[var(--silver)]">
      <span
        className={`font-semibold ${count === 0 ? "text-[rgba(148,163,184,0.5)]" : "text-[var(--silver)]"}`}
      >
        {count === 0 ? "Never retrieved" : `Retrieved ${count}×`}
      </span>
      {lastRetrievedAt && (
        <>
          <span className="text-[var(--border)]">·</span>
          <span>Last {relativeTime(lastRetrievedAt)}</span>
        </>
      )}
    </span>
  );
}

function SourceBadge({ source }: { source: string }) {
  const style =
    source === "confirmed"
      ? "bg-[rgba(34,197,94,0.1)] text-[#22c55e] border-[rgba(34,197,94,0.2)]"
      : "bg-[rgba(245,158,11,0.1)] text-[#f59e0b] border-[rgba(245,158,11,0.2)]";

  return (
    <span
      className={`text-[10px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded-full border ${style}`}
    >
      {source}
    </span>
  );
}

function TagBadge({ tag }: { tag: string }) {
  return (
    <span className="text-[10px] text-[var(--silver)] bg-[rgba(255,255,255,0.04)] border border-[var(--border)] px-1.5 py-0.5 rounded">
      {tag}
    </span>
  );
}

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

export default function MemoryPanel({
  memories,
  searchResults,
  onSearch,
  onClearSearch,
  onPin,
  onUnpin,
  onDelete,
  isSearching,
}: MemoryPanelProps) {
  const [searchQuery, setSearchQuery] = useState("");
  const [deleteConfirm, setDeleteConfirm] = useState<string | null>(null);
  const isSearchMode = searchResults.length > 0 || isSearching;

  // Group memories by month (chronological, ascending)
  const groupedMemories = useMemo(() => groupByMonth(memories), [memories]);

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    if (searchQuery.trim()) {
      onSearch(searchQuery.trim());
    }
  };

  const handleClearSearch = () => {
    setSearchQuery("");
    onClearSearch();
  };

  const handleExport = () => {
    const blob = new Blob([JSON.stringify(memories, null, 2)], {
      type: "application/json",
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "vitamem-memories.json";
    a.click();
    URL.revokeObjectURL(url);
  };

  // Animation index counter across groups
  let animIdx = 0;

  return (
    <div
      id="memory-panel"
      className="bg-[var(--slate)] border border-[var(--border)] rounded-xl overflow-hidden"
    >
      {/* Header */}
      <div className="px-4 py-3 border-b border-[var(--border)] flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="text-xs font-bold uppercase tracking-wider text-[var(--silver)]">
            Memories
          </span>
          <span className="text-xs font-bold text-[var(--teal-lt)] bg-[var(--teal-glow)] border border-[rgba(20,184,166,0.2)] px-2 py-0.5 rounded-full">
            {memories.length}
          </span>
        </div>
        {memories.length > 0 && (
          <button
            onClick={handleExport}
            className="text-[10px] font-semibold text-[var(--silver)] hover:text-[var(--snow)] transition-colors"
            title="Export memories as JSON"
          >
            Export ↓
          </button>
        )}
      </div>

      {/* Search */}
      <div className="px-4 py-2.5 border-b border-[var(--border)]">
        <form onSubmit={handleSearch} className="flex gap-2">
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search memories…"
            className="flex-1 bg-[rgba(255,255,255,0.04)] border border-[var(--border)] rounded-lg px-3 py-1.5 text-xs text-[var(--snow)] placeholder:text-[var(--silver)] outline-none focus:border-[rgba(20,184,166,0.4)] transition-colors"
          />
          {isSearchMode ? (
            <button
              type="button"
              onClick={handleClearSearch}
              className="text-xs font-semibold px-3 py-1.5 rounded-lg text-[var(--silver)] bg-[rgba(255,255,255,0.06)] border border-[var(--border)] hover:text-[var(--snow)] transition-colors"
            >
              Clear
            </button>
          ) : (
            <button
              type="submit"
              disabled={!searchQuery.trim()}
              className="text-xs font-semibold px-3 py-1.5 rounded-lg bg-[var(--teal)] text-white hover:bg-[var(--teal-mid)] disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
            >
              Search
            </button>
          )}
        </form>
      </div>

      {/* Content */}
      <div className="max-h-80 overflow-y-auto p-2">
        {isSearchMode ? (
          /* Search results */
          isSearching ? (
            <div className="text-center py-6 text-xs text-[var(--silver)]">
              Searching…
            </div>
          ) : searchResults.length === 0 ? (
            <div className="text-center py-6 text-xs text-[var(--silver)]">
              No results found.
            </div>
          ) : (
            <div className="space-y-1.5">
              {searchResults.map((r, i) => (
                <div
                  key={i}
                  className="animate-memory-pop px-3 py-2.5 rounded-lg border border-[var(--border)] bg-[rgba(255,255,255,0.02)]"
                  style={{ animationDelay: `${i * 80}ms`, animationFillMode: "both" }}
                >
                  <div className="text-[12.5px] leading-snug text-[var(--snow)]">
                    {r.pinned && <span className="mr-1">📌</span>}
                    {r.content}
                  </div>
                  <div className="flex items-center gap-1.5 mt-1.5 flex-wrap">
                    <span className="text-[10px] font-bold text-[var(--teal-lt)] bg-[var(--teal-glow)] px-1.5 py-0.5 rounded">
                      {r.score.toFixed(2)}
                    </span>
                    <SourceBadge source={r.source} />
                    {r.tags?.map((tag) => (
                      <TagBadge key={tag} tag={tag} />
                    ))}
                  </div>
                </div>
              ))}
            </div>
          )
        ) : memories.length === 0 ? (
          /* Empty state */
          <div className="text-center py-8 text-[13px] text-[var(--silver)]">
            <div className="text-[28px] mb-2">🧠</div>
            No memories yet.
            <br />
            End a session to extract them.
          </div>
        ) : (
          /* Memory list — grouped by month */
          <div className="space-y-3">
            {groupedMemories.map((group) => (
              <div key={group.sortKey}>
                {/* Month/year header */}
                <div className="sticky top-0 z-10 bg-[var(--slate)] px-2 py-1.5 -mx-2 mb-1.5">
                  <span className="text-[10px] font-bold uppercase tracking-widest text-[var(--silver)]">
                    {group.label}
                  </span>
                  <span className="text-[10px] text-[var(--silver)] ml-1.5 opacity-60">
                    ({group.items.length})
                  </span>
                </div>

                <div className="space-y-1.5">
                  {group.items.map((m) => {
                    const idx = animIdx++;
                    const isDecaying = (m.retrievalCount ?? 0) === 0;
                    return (
                      <div
                        key={m.id}
                        className={`animate-memory-pop px-3 py-2.5 rounded-lg border border-[var(--border)] bg-[rgba(255,255,255,0.02)] group ${
                          isDecaying ? "opacity-60" : ""
                        }`}
                        style={{
                          animationDelay: `${idx * 60}ms`,
                          animationFillMode: "both",
                        }}
                      >
                        <div className="flex items-start justify-between gap-2">
                          <div className="flex-1 min-w-0">
                            {/* Priority badge + content */}
                            <div className="flex items-start gap-1.5">
                              <PriorityBadge priority={m.priority} />
                              <div className="text-[12.5px] leading-snug text-[var(--snow)] flex-1">
                                {m.pinned && <span className="mr-1">📌</span>}
                                <TemporalContent content={m.content} />
                              </div>
                            </div>
                          </div>
                          <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity shrink-0">
                            <button
                              onClick={() =>
                                m.pinned ? onUnpin(m.id) : onPin(m.id)
                              }
                              className="text-[11px] p-1 rounded hover:bg-[rgba(255,255,255,0.06)] transition-colors"
                              title={m.pinned ? "Unpin" : "Pin"}
                            >
                              {m.pinned ? "📌" : "📍"}
                            </button>
                            {deleteConfirm === m.id ? (
                              <button
                                onClick={() => {
                                  onDelete(m.id);
                                  setDeleteConfirm(null);
                                }}
                                className="text-[10px] font-bold text-[#f43f5e] px-1.5 py-0.5 rounded bg-[rgba(244,63,94,0.1)] border border-[rgba(244,63,94,0.2)]"
                              >
                                Confirm
                              </button>
                            ) : (
                              <button
                                onClick={() => setDeleteConfirm(m.id)}
                                className="text-[11px] p-1 rounded hover:bg-[rgba(255,255,255,0.06)] transition-colors"
                                title="Delete"
                              >
                                🗑️
                              </button>
                            )}
                          </div>
                        </div>

                        {/* Metadata row: source, tags, decay info */}
                        <div className="flex items-center gap-1.5 mt-1.5 flex-wrap">
                          <SourceBadge source={m.source} />
                          {m.tags?.map((tag) => (
                            <TagBadge key={tag} tag={tag} />
                          ))}
                          <span className="text-[var(--border)]">·</span>
                          <DecayInfo
                            retrievalCount={m.retrievalCount}
                            lastRetrievedAt={m.lastRetrievedAt}
                          />
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
