-- Migration: per-record merge (P0-B2).
--
-- Conflict resolution used to be snapshot-level: one whole side won and the
-- other was parked in a backup slot. Two devices meant losing whichever one's
-- work was on the losing side. Merging per row needs two things the schema
-- did not have.
--
--  1. record_updated_at — a CLIENT-supplied stamp, one per row.
--
--     The existing updated_at is maintained by a trigger, so it is rewritten
--     to server-now on every push. Since the client upserts every row on every
--     push, that column says "when did this device last sync", not "when did
--     this row last change" — useless as a merge key. record_updated_at is
--     written by the device that made the change and is never touched by a
--     trigger, so it survives an unrelated re-push of the same row.
--
--     The cost is that two devices compare two device clocks. That is inherent
--     to last-write-wins; the alternative (server time) is unavailable here
--     precisely because the server cannot tell a real edit from a re-upload.
--     The client keeps its stamps monotonic so a backwards clock cannot make a
--     device permanently unable to win.
--
--  2. deleted_at — tombstones.
--
--     Deletion used to be absence: the client listed the ids it had and the
--     server deleted the rest (pruneOrphans). That is only correct while the
--     pushed snapshot is authoritative and complete. Under a merge, absence
--     means "I have not seen it", so a book created on the iPad would be
--     deleted by the iPhone's next push. pruneOrphans is removed in the same
--     commit as this migration; deleting now writes deleted_at instead, and
--     the loader filters tombstones out.
--
--     Rows are only ever tombstoned, never DELETEd, by the client. Real
--     removal is a server-side job with a wide window, not a client action.

alter table public.booklio_authors
  add column if not exists record_updated_at timestamptz,
  add column if not exists deleted_at timestamptz;

alter table public.booklio_books
  add column if not exists record_updated_at timestamptz,
  add column if not exists deleted_at timestamptz;

alter table public.booklio_reading_sessions
  add column if not exists record_updated_at timestamptz,
  add column if not exists deleted_at timestamptz;

alter table public.booklio_reviews
  add column if not exists record_updated_at timestamptz,
  add column if not exists deleted_at timestamptz;

alter table public.booklio_user_lists
  add column if not exists record_updated_at timestamptz,
  add column if not exists deleted_at timestamptz;

-- Loading filters on deleted_at for every table, always scoped to one user.
create index if not exists booklio_authors_live_idx
  on public.booklio_authors (user_id) where deleted_at is null;
create index if not exists booklio_books_live_idx
  on public.booklio_books (user_id) where deleted_at is null;
create index if not exists booklio_reading_sessions_live_idx
  on public.booklio_reading_sessions (user_id) where deleted_at is null;
create index if not exists booklio_reviews_live_idx
  on public.booklio_reviews (user_id) where deleted_at is null;
create index if not exists booklio_user_lists_live_idx
  on public.booklio_user_lists (user_id) where deleted_at is null;

-- Unrelated but the same class of bug as f3dd7bc: a book inserted without an
-- explicit language used to come back as English. "" is what the app means by
-- unknown, and a default that invents a language re-poisons the language lock
-- from the server side.
alter table public.booklio_books
  alter column language set default '';
