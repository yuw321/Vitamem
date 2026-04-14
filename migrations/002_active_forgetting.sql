-- Active forgetting: retrieval tracking columns for memory decay
ALTER TABLE memories
  ADD COLUMN IF NOT EXISTS last_retrieved_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS retrieval_count INTEGER DEFAULT 0;
