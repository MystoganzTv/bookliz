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
