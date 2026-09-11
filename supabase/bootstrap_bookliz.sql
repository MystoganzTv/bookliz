-- Bookliz — esquema completo para un proyecto Supabase NUEVO.
-- Generado 2026-09-11 concatenando supabase/migrations/ en orden. Pegar entero en SQL Editor → Run.


-- ═══════════ supabase/migrations/20260526_create_booklio_core.sql ═══════════
create extension if not exists "pgcrypto";

create table if not exists public.booklio_profiles (
  user_id uuid primary key references auth.users(id) on delete cascade,
  name text not null,
  avatar_initials text not null,
  avatar_uri text,
  email text,
  auth_provider text,
  reading_level text not null,
  yearly_goal integer not null default 12,
  favorite_authors text[] not null default '{}',
  favorite_genres text[] not null default '{}',
  top_book_ids text[] not null default '{}',
  achievements jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

create table if not exists public.booklio_authors (
  user_id uuid not null references auth.users(id) on delete cascade,
  id text not null,
  name text not null,
  bio text not null default '',
  favorite_genres text[] not null default '{}',
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  primary key (user_id, id)
);

create table if not exists public.booklio_books (
  user_id uuid not null references auth.users(id) on delete cascade,
  id text not null,
  title text not null,
  author_id text not null,
  series_id text,
  series_name text,
  series_number integer,
  saga_order integer,
  release_order integer,
  synopsis text not null default '',
  genre text[] not null default '{}',
  pages integer not null default 0,
  published_date text not null default '',
  publisher text not null default '',
  language text not null default 'English',
  isbn text not null default '',
  format text not null default 'physical',
  cover_gradient text[] not null default '{}',
  cover_image_uri text,
  upcoming_release_date text,
  is_bestseller boolean,
  is_sequel boolean,
  tags text[] not null default '{}',
  user_status jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  primary key (user_id, id)
);

create table if not exists public.booklio_reading_sessions (
  user_id uuid not null references auth.users(id) on delete cascade,
  id text not null,
  book_id text not null,
  date text not null,
  start_page integer not null default 0,
  end_page integer not null default 0,
  pages_read integer not null default 0,
  minutes_read integer not null default 0,
  location text not null default '',
  mood text not null default '',
  format text not null default 'physical',
  notes text not null default '',
  favorite_quote text,
  difficulty text not null default 'moderate',
  enjoyment_rating integer not null default 0,
  pages_per_hour double precision not null default 0,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  primary key (user_id, id)
);

create or replace function public.booklio_set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = timezone('utc', now());
  return new;
end;
$$;

drop trigger if exists trg_booklio_profiles_updated_at on public.booklio_profiles;
create trigger trg_booklio_profiles_updated_at
before update on public.booklio_profiles
for each row execute function public.booklio_set_updated_at();

drop trigger if exists trg_booklio_authors_updated_at on public.booklio_authors;
create trigger trg_booklio_authors_updated_at
before update on public.booklio_authors
for each row execute function public.booklio_set_updated_at();

drop trigger if exists trg_booklio_books_updated_at on public.booklio_books;
create trigger trg_booklio_books_updated_at
before update on public.booklio_books
for each row execute function public.booklio_set_updated_at();

drop trigger if exists trg_booklio_reading_sessions_updated_at on public.booklio_reading_sessions;
create trigger trg_booklio_reading_sessions_updated_at
before update on public.booklio_reading_sessions
for each row execute function public.booklio_set_updated_at();

alter table public.booklio_profiles enable row level security;
alter table public.booklio_authors enable row level security;
alter table public.booklio_books enable row level security;
alter table public.booklio_reading_sessions enable row level security;

drop policy if exists "booklio_profiles_select_own" on public.booklio_profiles;
create policy "booklio_profiles_select_own"
on public.booklio_profiles
for select
using (auth.uid() = user_id);

drop policy if exists "booklio_profiles_insert_own" on public.booklio_profiles;
create policy "booklio_profiles_insert_own"
on public.booklio_profiles
for insert
with check (auth.uid() = user_id);

drop policy if exists "booklio_profiles_update_own" on public.booklio_profiles;
create policy "booklio_profiles_update_own"
on public.booklio_profiles
for update
using (auth.uid() = user_id)
with check (auth.uid() = user_id);

drop policy if exists "booklio_profiles_delete_own" on public.booklio_profiles;
create policy "booklio_profiles_delete_own"
on public.booklio_profiles
for delete
using (auth.uid() = user_id);

drop policy if exists "booklio_authors_select_own" on public.booklio_authors;
create policy "booklio_authors_select_own"
on public.booklio_authors
for select
using (auth.uid() = user_id);

drop policy if exists "booklio_authors_insert_own" on public.booklio_authors;
create policy "booklio_authors_insert_own"
on public.booklio_authors
for insert
with check (auth.uid() = user_id);

drop policy if exists "booklio_authors_update_own" on public.booklio_authors;
create policy "booklio_authors_update_own"
on public.booklio_authors
for update
using (auth.uid() = user_id)
with check (auth.uid() = user_id);

drop policy if exists "booklio_authors_delete_own" on public.booklio_authors;
create policy "booklio_authors_delete_own"
on public.booklio_authors
for delete
using (auth.uid() = user_id);

drop policy if exists "booklio_books_select_own" on public.booklio_books;
create policy "booklio_books_select_own"
on public.booklio_books
for select
using (auth.uid() = user_id);

drop policy if exists "booklio_books_insert_own" on public.booklio_books;
create policy "booklio_books_insert_own"
on public.booklio_books
for insert
with check (auth.uid() = user_id);

drop policy if exists "booklio_books_update_own" on public.booklio_books;
create policy "booklio_books_update_own"
on public.booklio_books
for update
using (auth.uid() = user_id)
with check (auth.uid() = user_id);

drop policy if exists "booklio_books_delete_own" on public.booklio_books;
create policy "booklio_books_delete_own"
on public.booklio_books
for delete
using (auth.uid() = user_id);

drop policy if exists "booklio_reading_sessions_select_own" on public.booklio_reading_sessions;
create policy "booklio_reading_sessions_select_own"
on public.booklio_reading_sessions
for select
using (auth.uid() = user_id);

drop policy if exists "booklio_reading_sessions_insert_own" on public.booklio_reading_sessions;
create policy "booklio_reading_sessions_insert_own"
on public.booklio_reading_sessions
for insert
with check (auth.uid() = user_id);

drop policy if exists "booklio_reading_sessions_update_own" on public.booklio_reading_sessions;
create policy "booklio_reading_sessions_update_own"
on public.booklio_reading_sessions
for update
using (auth.uid() = user_id)
with check (auth.uid() = user_id);

drop policy if exists "booklio_reading_sessions_delete_own" on public.booklio_reading_sessions;
create policy "booklio_reading_sessions_delete_own"
on public.booklio_reading_sessions
for delete
using (auth.uid() = user_id);


-- ═══════════ supabase/migrations/20260527_add_reviews.sql ═══════════
-- Migration: add booklio_reviews table
-- Reviews were only persisted locally; this wires them into Supabase cloud sync.

create table if not exists public.booklio_reviews (
  user_id uuid not null references auth.users(id) on delete cascade,
  id text not null,
  book_id text not null,
  rating integer not null default 0,
  title text not null default '',
  body text not null default '',
  created_at text not null default '',
  synced_at timestamptz not null default timezone('utc', now()),
  primary key (user_id, id)
);

create or replace trigger trg_booklio_reviews_synced_at
before update on public.booklio_reviews
for each row execute function public.booklio_set_updated_at();

alter table public.booklio_reviews enable row level security;

drop policy if exists "booklio_reviews_select_own" on public.booklio_reviews;
create policy "booklio_reviews_select_own"
on public.booklio_reviews for select using (auth.uid() = user_id);

drop policy if exists "booklio_reviews_insert_own" on public.booklio_reviews;
create policy "booklio_reviews_insert_own"
on public.booklio_reviews for insert with check (auth.uid() = user_id);

drop policy if exists "booklio_reviews_update_own" on public.booklio_reviews;
create policy "booklio_reviews_update_own"
on public.booklio_reviews for update
using (auth.uid() = user_id) with check (auth.uid() = user_id);

drop policy if exists "booklio_reviews_delete_own" on public.booklio_reviews;
create policy "booklio_reviews_delete_own"
on public.booklio_reviews for delete using (auth.uid() = user_id);


-- ═══════════ supabase/migrations/20260527_add_user_lists.sql ═══════════
-- Migration: add booklio_user_lists table
-- Custom user-created collections of books.

create table if not exists public.booklio_user_lists (
  user_id uuid not null references auth.users(id) on delete cascade,
  id text not null,
  name text not null,
  emoji text,
  book_ids text[] not null default '{}',
  created_at text not null default '',
  updated_at text not null default '',
  synced_at timestamptz not null default timezone('utc', now()),
  primary key (user_id, id)
);

alter table public.booklio_user_lists enable row level security;

drop policy if exists "booklio_user_lists_select_own" on public.booklio_user_lists;
create policy "booklio_user_lists_select_own"
on public.booklio_user_lists for select using (auth.uid() = user_id);

drop policy if exists "booklio_user_lists_insert_own" on public.booklio_user_lists;
create policy "booklio_user_lists_insert_own"
on public.booklio_user_lists for insert with check (auth.uid() = user_id);

drop policy if exists "booklio_user_lists_update_own" on public.booklio_user_lists;
create policy "booklio_user_lists_update_own"
on public.booklio_user_lists for update
using (auth.uid() = user_id) with check (auth.uid() = user_id);

drop policy if exists "booklio_user_lists_delete_own" on public.booklio_user_lists;
create policy "booklio_user_lists_delete_own"
on public.booklio_user_lists for delete using (auth.uid() = user_id);


-- ═══════════ supabase/migrations/20260529_add_book_intelligence_fields.sql ═══════════
-- Migration: Book Intelligence Engine fields
-- Adds work_key, edition_key, language_code to booklio_books.
--
-- Safe to run multiple times (IF NOT EXISTS / IF EXISTS guards throughout).
-- Apply via:
--   Supabase Dashboard → SQL Editor → paste & run, OR
--   supabase db push  (if using the Supabase CLI with a linked project)

-- ─── New columns ─────────────────────────────────────────────────────────────

alter table public.booklio_books
  add column if not exists work_key text,
  add column if not exists edition_key text,
  add column if not exists language_code text;

-- work_key     — Open Library canonical work key, e.g. "/works/OL12345W"
--                NULL for books added before the Intelligence Engine,
--                or for books sourced exclusively from Google Books.
--
-- edition_key  — Open Library edition key, e.g. "/books/OL12345M"
--                NULL when the specific edition isn't in Open Library.
--
-- language_code — ISO 639-1 two-letter code, e.g. "en", "es", "fr"
--                 NULL for legacy rows (language stored as display name
--                 in the existing `language` text column).

-- ─── Indexes ─────────────────────────────────────────────────────────────────

-- Allows fast "find all editions of the same work" queries per user.
create index if not exists idx_booklio_books_work_key
  on public.booklio_books (user_id, work_key)
  where work_key is not null;

-- Allows dedup checks: "does this user already have this exact edition?"
create index if not exists idx_booklio_books_edition_key
  on public.booklio_books (user_id, edition_key)
  where edition_key is not null;

-- Supports "show me all books in Spanish" filters.
create index if not exists idx_booklio_books_language_code
  on public.booklio_books (user_id, language_code)
  where language_code is not null;

-- ─── Back-fill hint (optional, run manually if desired) ───────────────────────
-- The columns default to NULL for all pre-existing rows.
-- No automatic back-fill is performed here; the app will populate
-- work_key / edition_key / language_code the next time a book is
-- edited or re-fetched through the Book Intelligence Engine.


-- ═══════════ supabase/migrations/20260610230000_booklio_reading_identity.sql ═══════════
-- Phase 1 (BOOKLIZ_PLATFORM_ROADMAP.md): cross-device copy of the on-device
-- ReadingIdentity. The app NEVER depends on this table — identity is computed
-- and stored locally; this row only enables restore on a new device and future
-- server-side features (taste neighbors, Phase 3).
--
-- Run in the Supabase SQL editor (or `supabase db push`) BEFORE wiring the
-- repository sync for this table.

create table if not exists booklio_reading_identity (
  user_id uuid primary key references auth.users (id) on delete cascade,
  identity jsonb not null,
  version int not null default 1,
  updated_at timestamptz not null default now()
);

alter table booklio_reading_identity enable row level security;

create policy "Users read own identity"
  on booklio_reading_identity for select
  using (auth.uid() = user_id);

create policy "Users upsert own identity"
  on booklio_reading_identity for insert
  with check (auth.uid() = user_id);

create policy "Users update own identity"
  on booklio_reading_identity for update
  using (auth.uid() = user_id);

create policy "Users delete own identity"
  on booklio_reading_identity for delete
  using (auth.uid() = user_id);


-- ═══════════ supabase/migrations/20260911120000_fix_sync_schema.sql ═══════════
-- Migration: make cloud sync actually work + real account deletion.
--
-- Found in the 2026-09-11 audit. None of this was caught by tests because the
-- suite mocks `supabase` entirely.
--
--  1. booklio_books lacked the co_author_* columns the mapper has been writing
--     since 2026-06-10 → every book upsert failed with PGRST204.
--  2. booklio_reviews' trigger called booklio_set_updated_at(), which assigns
--     new.updated_at — a column that table does not have (it has synced_at).
--     Every UPDATE of an existing review failed with 42703.
--  3. booklio_profiles.snapshot_pushed_at: written LAST by the client after all
--     child tables uploaded. A profile row without it (or with children missing)
--     is a half-finished push, and the loader must not treat it as "the cloud
--     is empty" — that is exactly what wiped local libraries.
--  4. booklio_delete_account(): "Delete account" in Settings used to clear only
--     the device. The privacy policy promises server-side erasure and App
--     Review requires it. SECURITY DEFINER so the caller can delete its own
--     auth.users row; the cascades remove the rest.

-- 1 ─────────────────────────────────────────────────────────────────────────
alter table public.booklio_books
  add column if not exists co_author_names text[],
  add column if not exists co_author_ids text[];

-- 2 ─────────────────────────────────────────────────────────────────────────
create or replace function public.booklio_set_synced_at()
returns trigger
language plpgsql
as $$
begin
  new.synced_at = timezone('utc', now());
  return new;
end;
$$;

drop trigger if exists trg_booklio_reviews_synced_at on public.booklio_reviews;
create trigger trg_booklio_reviews_synced_at
before update on public.booklio_reviews
for each row execute function public.booklio_set_synced_at();

drop trigger if exists trg_booklio_user_lists_synced_at on public.booklio_user_lists;
create trigger trg_booklio_user_lists_synced_at
before update on public.booklio_user_lists
for each row execute function public.booklio_set_synced_at();

-- 3 ─────────────────────────────────────────────────────────────────────────
alter table public.booklio_profiles
  add column if not exists snapshot_pushed_at timestamptz;

-- 4 ─────────────────────────────────────────────────────────────────────────
create or replace function public.booklio_delete_account()
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  uid uuid := auth.uid();
begin
  if uid is null then
    raise exception 'booklio_delete_account: not authenticated';
  end if;

  delete from public.booklio_user_lists       where user_id = uid;
  delete from public.booklio_reviews          where user_id = uid;
  delete from public.booklio_reading_sessions where user_id = uid;
  delete from public.booklio_books            where user_id = uid;
  delete from public.booklio_authors          where user_id = uid;
  delete from public.booklio_profiles         where user_id = uid;
  delete from public.booklio_reading_identity where user_id = uid;
  delete from auth.users                      where id = uid;
end;
$$;

revoke all on function public.booklio_delete_account() from public;
grant execute on function public.booklio_delete_account() to authenticated;

