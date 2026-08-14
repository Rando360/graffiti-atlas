-- ============================================================================
--  "Ignore this pairing" — remember two photos that a moderator confirmed are
--  NOT duplicates of each other, so they stop being flagged together (they can
--  still be flagged against other nearby photos). Stored with a < b so the pair
--  is order-independent. Run once in the Supabase SQL editor.
-- ============================================================================
create table if not exists public.ignored_dup_pairs (
  a uuid not null,
  b uuid not null,
  created_at timestamptz not null default now(),
  primary key (a, b)
);

-- Backend (service_role) manages this table; keep it closed to the public key.
alter table public.ignored_dup_pairs enable row level security;
