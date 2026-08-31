"use client";

import { useRef } from "react";

/** Flipped by the first component that actually gets to animate. */
let consumed = false;

/**
 * Gates the staged entrance so it plays once — on the render where the
 * dashboard first has data to show — and never again.
 *
 * Switching tabs remounts a tab's content, and a tab switch is a
 * high-frequency interaction; replaying an entrance on every one would charge
 * its attention cost over and over. This makes the animation an arrival.
 *
 * `active` must be something that can only become true on the client (here,
 * the workbook finishing loading). The server and the hydrating client both
 * render with it false, so the markup matches; the decision is taken later,
 * on the first render that actually shows figures, which also means the
 * elements never paint once unstyled before the animation starts.
 */
export function useFirstPaint(active: boolean): boolean {
  const decided = useRef<boolean | null>(null);
  if (decided.current === null && active) {
    decided.current = !consumed;
    consumed = true;
  }
  return decided.current ?? false;
}
