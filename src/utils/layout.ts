import { useWindowDimensions } from "react-native";

/**
 * Where a phone layout stops being the right answer.
 *
 * 820pt is above every iPhone in portrait (the widest, the Pro Max, is 440)
 * and below an iPad Pro 13" in portrait (1024), so it separates "one column
 * of cards" from "a screen with room for two". It also catches an iPad in
 * landscape and a tablet-sized split view, which is the point: the question
 * is how much width this layout actually has right now, not what device it
 * is running on.
 */
export const WIDE_BREAKPOINT = 820;

/** True when there is room for a tablet layout. Re-evaluates on rotation and split view. */
export function useIsWide(): boolean {
  const { width } = useWindowDimensions();
  return width >= WIDE_BREAKPOINT;
}
