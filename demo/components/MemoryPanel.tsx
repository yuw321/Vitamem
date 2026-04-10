"use client";

import { useState } from "react";

export interface MemoryItem {
  id: string;
  content: string;
  source: string;
  tags?: string[];
  pinned?: boolean;
  createdAt?: string;
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
      <div className="max-h-64 overflow-y-auto p-2">
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
          /* Memory list */
          <div className="space-y-1.5">
            {memories.map((m, i) => (
              <div
                key={m.id}
                className="animate-memory-pop px-3 py-2.5 rounded-lg border border-[var(--border)] bg-[rgba(255,255,255,0.02)] group"
                style={{ animationDelay: `${i * 60}ms`, animationFillMode: "both" }}
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="text-[12.5px] leading-snug text-[var(--snow)] flex-1">
                    {m.pinned && <span className="mr-1">📌</span>}
                    {m.content}
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
                <div className="flex items-center gap-1.5 mt-1.5 flex-wrap">
                  <SourceBadge source={m.source} />
                  {m.tags?.map((tag) => (
                    <TagBadge key={tag} tag={tag} />
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
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
