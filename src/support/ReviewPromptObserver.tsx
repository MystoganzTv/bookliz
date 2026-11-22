import * as StoreReview from "expo-store-review";
import { useEffect, useMemo, useRef } from "react";
import { AppState } from "react-native";
import { useBookliz } from "../data/BooklizContext";
import {
  detectMoment,
  LibraryTally,
  loadReviewLedger,
  recordAsk,
  ReviewMoment,
  saveReviewLedger,
  shouldAsk,
  tallyLibrary,
} from "./reviewPrompt";

/**
 * Asks iOS for the rating sheet right after a good moment (see reviewPrompt.ts
 * for which ones and how often). Renders nothing.
 *
 * "Never on launch" is enforced twice: the first tally after the library loads
 * is only a baseline, and anything in the first seconds after that is ignored,
 * because that is when a cloud download can still nudge the counts by one.
 * Onboarding is left alone: the baseline is taken once it is finished.
 */
const LAUNCH_GRACE_MS = 10_000;
/** Lets the finish celebration or the new spine land before the sheet slides up. */
const SETTLE_MS = 2_000;

let asking = false;

async function askIfDue(moment: ReviewMoment, year: number): Promise<void> {
  if (asking) return;
  asking = true;
  try {
    const ledger = await loadReviewLedger();
    if (!shouldAsk(moment, ledger, Date.now(), year)) return;
    if (!(await StoreReview.isAvailableAsync())) return;
    await new Promise((resolve) => setTimeout(resolve, SETTLE_MS));
    if (AppState.currentState !== "active") return;
    await saveReviewLedger(recordAsk(moment, ledger, Date.now(), year));
    if (__DEV__) console.log(`[REVIEW_PROMPT] asking after ${moment}`);
    await StoreReview.requestReview();
  } catch {
    // A rating request is never worth an error on screen.
  } finally {
    asking = false;
  }
}

export function ReviewPromptObserver() {
  const { hydrated, onboardingComplete, books, readingSessions, userProfile } = useBookliz();
  const tally = useMemo(
    () => tallyLibrary(books, readingSessions, userProfile.yearlyGoal, new Date()),
    [books, readingSessions, userProfile.yearlyGoal]
  );
  const prevRef = useRef<LibraryTally | null>(null);
  const readyAtRef = useRef(0);

  useEffect(() => {
    if (!hydrated || !onboardingComplete) {
      prevRef.current = null;
      return;
    }
    const prev = prevRef.current;
    prevRef.current = tally;
    if (!prev) {
      readyAtRef.current = Date.now();
      return;
    }
    if (Date.now() - readyAtRef.current < LAUNCH_GRACE_MS) return;
    const moment = detectMoment(prev, tally);
    if (moment) void askIfDue(moment, tally.year);
  }, [hydrated, onboardingComplete, tally]);

  return null;
}
