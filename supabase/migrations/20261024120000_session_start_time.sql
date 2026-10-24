-- Migration: reading session start time.
--
-- A session carried only its calendar day, so the time-of-day achievements
-- (Night Reading, Midnight Reader, Night Owl, Morning Reader) had their
-- progress pinned to 0 in the app: listed, impossible to earn.
--
-- start_time is the local wall-clock time the session began, 'HH:MM'. Text,
-- not time/timestamptz, on purpose: it is the reader's local clock, paired with
-- the local `date` already stored, and must not be shifted by any time zone.
--
-- Nullable and with no default: null = unknown (every session logged before
-- this column, and past-day sessions the reader gave no time). A default would
-- be a fabricated hour.
--
-- APPLY BEFORE shipping a build that writes it: PostgREST rejects an upsert
-- that names a column the table does not have, and the whole session push
-- fails with it.

alter table public.booklio_reading_sessions
  add column if not exists start_time text;
