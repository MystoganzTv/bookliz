-- Migration: audiobook duration.
--
-- An audiobook has no pages, and until now its progress was a percentage over
-- a page count that was either borrowed from the print edition or invented
-- (100). "42%" was therefore not checkable against the app in the reader's
-- ears. duration_minutes lets the app ask for, and show, a time.
--
-- Nullable on purpose and null for everything that is not an audiobook — and
-- for audiobooks whose length nobody has entered, which keep the percentage.
-- A default here would be the same fabrication one layer down.

alter table public.booklio_books
  add column if not exists duration_minutes integer;
