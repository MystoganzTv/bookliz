import { useEffect, useRef, useState } from "react";
import { SettingsRow } from "../components/settings/SettingsList";
import { useBookliz } from "../data/BooklizContext";
import { lookupByQuery, workEditionToNewBookInput } from "../services/bookMetadataAggregator";
import type { BookEdition, BookWork } from "../types/bookMetadata";
import type { NewBookInput } from "../types/models";
import { localDateKey } from "../utils/dateUtils";
import { SCREENSHOT_LIBRARY, SCREENSHOT_YEARLY_GOAL, SeedBook, sessionsFor } from "./screenshotSeed";

/**
 * Development-only row: replaces the library with the screenshot library
 * (see screenshotSeed.ts). Each change is applied on its own render, so every
 * call sees the books and sessions the previous one created — the context's
 * mutators read state from their render, and a burst in one tick would
 * compute book progress from stale sessions.
 */
type Step = () => void;

interface Picked {
  input: NewBookInput;
  pages: number;
  label: string;
}

/** The same search the Add-book screen runs, restricted to the book's language. */
async function pickEdition(seed: SeedBook): Promise<Picked | undefined> {
  const result = await lookupByQuery(seed.title, seed.author, "title", { language: seed.lang });
  const works: BookWork[] = result.works.length ? result.works : result.work ? [result.work] : [];
  for (const work of works) {
    const editions: BookEdition[] = [work.bestEdition, ...work.editions];
    const inLang = editions.filter((e) => e.languageCode === seed.lang);
    const edition =
      inLang.find((e) => e.coverUrl && (e.pageCount ?? 0) > 0) ??
      inLang.find((e) => e.coverUrl) ??
      inLang[0];
    if (edition) {
      return {
        input: workEditionToNewBookInput(work, edition, "search"),
        pages: edition.pageCount ?? 0,
        label: `${edition.title} | ${edition.languageCode} | ${edition.pageCount ?? 0}p | cover:${!!edition.coverUrl}`,
      };
    }
  }
  return undefined;
}

const daysAgoKey = (days: number) => {
  const d = new Date();
  d.setDate(d.getDate() - days);
  return localDateKey(d);
};

export function ScreenshotSeedRow() {
  const ctx = useBookliz();
  const ctxRef = useRef(ctx);
  ctxRef.current = ctx;
  const [queue, setQueue] = useState<Step[]>([]);
  const [status, setStatus] = useState("");
  const [busy, setBusy] = useState(false);
  const idsRef = useRef(new Map<number, string>());

  useEffect(() => {
    if (queue.length === 0) return;
    const [step, ...rest] = queue;
    step();
    setQueue(rest);
    if (rest.length === 0) {
      setBusy(false);
      setStatus((s) => `Done. ${s}`);
    }
  }, [queue]);

  const run = async () => {
    console.log("[SEED] run, books:", ctxRef.current.books.length);
    // No clearLibrary here: it drops `hydrated`, which remounts this screen
    // and loses the queue mid-run. "Clear library" below does it first.
    if (ctxRef.current.books.length > 0) {
      setStatus("Clear the library first (Danger zone below), then tap again.");
      return;
    }
    setBusy(true);
    idsRef.current.clear();

    const found: Array<{ index: number; seed: SeedBook; match: Picked }> = [];
    const missing: string[] = [];
    for (let i = 0; i < SCREENSHOT_LIBRARY.length; i++) {
      const seed = SCREENSHOT_LIBRARY[i];
      setStatus(`Looking up ${i + 1}/${SCREENSHOT_LIBRARY.length}: ${seed.title}`);
      let match: Picked | undefined;
      try {
        match = await pickEdition(seed);
      } catch (e) {
        console.log("[SEED] lookup error", seed.title, String(e));
      }
      console.log("[SEED]", seed.title, "→", match ? match.label : "NOT FOUND");
      if (match) found.push({ index: i, seed, match });
      else missing.push(seed.title);
    }

    const steps: Step[] = [];
    for (const { index, match } of found) {
      steps.push(() => {
        const book = ctxRef.current.addBook(match.input);
        idsRef.current.set(index, book.id);
      });
    }
    for (const { index, seed, match } of found) {
      const sessions = sessionsFor(seed.plan, match.pages, index);
      for (const s of sessions) {
        steps.push(() => {
          const bookId = idsRef.current.get(index);
          if (!bookId) return;
          const book = ctxRef.current.getBook(bookId);
          ctxRef.current.addReadingSession({
            bookId,
            date: daysAgoKey(s.daysAgo),
            startTime: s.startTime,
            startPage: s.startPage,
            endPage: s.endPage,
            minutesRead: s.minutesRead,
            location: s.location,
            mood: "—",
            format: book?.format ?? "paperback",
            notes: "",
          });
        });
      }
      if (seed.plan.kind === "read") {
        const rating = seed.plan.rating;
        steps.push(() => {
          const bookId = idsRef.current.get(index);
          if (bookId) ctxRef.current.updateBookStatus(bookId, "read", rating);
        });
      }
    }
    steps.push(() => {
      const p = ctxRef.current.userProfile;
      ctxRef.current.updateUserProfile({
        name: p.name,
        avatarInitials: p.avatarInitials ?? "",
        yearlyGoal: SCREENSHOT_YEARLY_GOAL,
        yearlyGoalMode: "custom",
        favoriteAuthors: p.favoriteAuthors,
        favoriteGenres: p.favoriteGenres,
      });
    });

    setStatus(
      `${found.length} books added${missing.length ? `; not found: ${missing.join(", ")}` : ""}.`
    );
    setQueue(steps);
  };

  return (
    <SettingsRow
      title="Fill library for App Store screenshots"
      subtitle={status || "Fills an empty library with real books looked up online."}
      disabled={busy}
      onPress={() => {
        // No confirmation: it only ever fills an empty library.
        void run().catch((e) => {
          console.log("[SEED] failed", e);
          setStatus(`Failed: ${String(e)}`);
          setBusy(false);
        });
      }}
    />
  );
}
