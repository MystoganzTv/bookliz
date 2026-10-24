-- Library folders (Bookliz 1.2).
--
-- One row per folder. Membership lives on the folder (book_ids), like
-- booklio_user_lists, so moving a book touches only the two folders involved
-- and nothing in booklio_books changes. Folders nest through parent_id.
--
-- Same shape as every merged table since 20260912120000: composite primary key
-- (user_id, id), record_updated_at written by the client, deleted_at
-- tombstones instead of DELETEs, RLS scoped to auth.uid().
--
-- The app tolerates this table not existing yet (folders stay on the device
-- and go up on the first push after this migration), so applying it is safe
-- at any time. After applying, re-check RLS with the anon key:
--   GET /rest/v1/booklio_folders?select=id  →  [] with no JWT.
--
-- Prefix stays booklio_ on purpose — see the header of bootstrap_bookliz.sql.

create table if not exists public.booklio_folders (
  user_id uuid not null references auth.users(id) on delete cascade,
  id text not null,
  name text not null,
  emoji text,
  parent_id text,
  book_ids text[] not null default '{}',
  created_at text not null default '',
  updated_at text not null default '',
  synced_at timestamptz not null default timezone('utc', now()),
  record_updated_at timestamptz,
  deleted_at timestamptz,
  primary key (user_id, id)
);

alter table public.booklio_folders enable row level security;

drop policy if exists "booklio_folders_select_own" on public.booklio_folders;
create policy "booklio_folders_select_own"
on public.booklio_folders for select using (auth.uid() = user_id);

drop policy if exists "booklio_folders_insert_own" on public.booklio_folders;
create policy "booklio_folders_insert_own"
on public.booklio_folders for insert with check (auth.uid() = user_id);

drop policy if exists "booklio_folders_update_own" on public.booklio_folders;
create policy "booklio_folders_update_own"
on public.booklio_folders for update
using (auth.uid() = user_id) with check (auth.uid() = user_id);

drop policy if exists "booklio_folders_delete_own" on public.booklio_folders;
create policy "booklio_folders_delete_own"
on public.booklio_folders for delete using (auth.uid() = user_id);

drop trigger if exists trg_booklio_folders_synced_at on public.booklio_folders;
create trigger trg_booklio_folders_synced_at
before update on public.booklio_folders
for each row execute function public.booklio_set_synced_at();

create index if not exists booklio_folders_live_idx
  on public.booklio_folders (user_id) where deleted_at is null;

-- "Delete account" must erase folders too. auth.users cascades already, but
-- the function deletes every table explicitly and keeps doing so.
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

  delete from public.booklio_folders          where user_id = uid;
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
