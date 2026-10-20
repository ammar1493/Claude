"use client";

import { useEffect, useRef, useState } from "react";
import { Icon } from "../Icons";

/**
 * Remove, then mean it.
 *
 * Removing a sheet throws away an upload: the workbook leaves the browser and
 * the only copy left is whatever the trainer emailed. There is no undo, and
 * the summary's remove sits at the end of a row that opens the sheet when
 * clicked — so a slip lands on the one control that cannot be taken back.
 *
 * Two presses rather than a dialog. A dialog would stop the page to ask a
 * question the button can ask itself, and this way the answer is one press
 * away from the thing it is about. The armed state gives up after a few
 * seconds, so a button left armed by a wandering mouse does not sit there
 * waiting to catch the next click.
 */
export function RemoveButton({
  what,
  onRemove,
  variant = "icon",
}: {
  /** Named in the label and the confirmation, so it is clear what goes. */
  what: string;
  onRemove: () => void;
  variant?: "icon" | "labelled";
}) {
  const [armed, setArmed] = useState(false);
  const timer = useRef<number | null>(null);

  useEffect(() => {
    if (!armed) return;
    timer.current = window.setTimeout(() => setArmed(false), 4000);
    return () => {
      if (timer.current !== null) window.clearTimeout(timer.current);
    };
  }, [armed]);

  const press = (e: React.MouseEvent) => {
    // The summary row opens the sheet; removing it must not also open it.
    e.stopPropagation();
    if (!armed) {
      setArmed(true);
      return;
    }
    setArmed(false);
    onRemove();
  };

  if (variant === "labelled") {
    return (
      <button
        type="button"
        onClick={press}
        onBlur={() => setArmed(false)}
        aria-label={armed ? `Confirm removing ${what}` : `Remove ${what}`}
        title={`Remove ${what} from this month. The file leaves the browser.`}
        className={`flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-xs font-bold transition-colors duration-150 ${
          armed
            ? "bg-[#B3261E] text-white"
            : "bg-white text-slate-ink hover:bg-navy-050 hover:text-navy"
        }`}
      >
        <Icon name="trash" size={14} />
        {armed ? "Remove it — sure?" : "Remove this sheet"}
      </button>
    );
  }

  return (
    <button
      type="button"
      onClick={press}
      onBlur={() => setArmed(false)}
      aria-label={armed ? `Confirm removing ${what}` : `Remove ${what}`}
      title={armed ? `Press again to remove ${what}` : `Remove ${what}`}
      className={`flex items-center gap-1 rounded px-1.5 py-1 text-[11px] font-bold whitespace-nowrap transition-colors duration-150 ${
        armed
          ? "bg-[#B3261E] text-white"
          : "text-slate-ink hover:bg-navy-050 hover:text-navy"
      }`}
    >
      <Icon name="trash" size={14} />
      {/* Armed, the icon alone does not say that a second press is wanted. */}
      {armed && "Sure?"}
    </button>
  );
}
