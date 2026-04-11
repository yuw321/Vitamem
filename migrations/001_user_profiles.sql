-- Create user_profiles table for the hybrid memory architecture
-- Stores structured critical data (conditions, medications, allergies, vitals)
-- alongside the existing memories table for freeform semantic data

CREATE TABLE IF NOT EXISTS user_profiles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id TEXT UNIQUE NOT NULL,
  conditions TEXT[] DEFAULT '{}',
  medications JSONB DEFAULT '[]',
  allergies TEXT[] DEFAULT '{}',
  vitals JSONB DEFAULT '{}',
  goals TEXT[] DEFAULT '{}',
  emergency_contacts TEXT[] DEFAULT '{}',
  custom_fields JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- Index for fast user lookups
CREATE INDEX IF NOT EXISTS idx_user_profiles_user_id ON user_profiles(user_id);

-- Enable Row Level Security
ALTER TABLE user_profiles ENABLE ROW LEVEL SECURITY;

-- RLS policy: users can only access their own profile
CREATE POLICY "Users can manage their own profile"
  ON user_profiles
  FOR ALL
  USING (auth.uid()::text = user_id)
  WITH CHECK (auth.uid()::text = user_id);

-- Auto-update the updated_at timestamp
CREATE OR REPLACE FUNCTION update_profile_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_update_profile_updated_at
  BEFORE UPDATE ON user_profiles
  FOR EACH ROW
  EXECUTE FUNCTION update_profile_updated_at();
