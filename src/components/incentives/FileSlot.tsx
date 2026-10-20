"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import { Icon, type IconName } from "../Icons";

/**
 * One drop target. The verifier needs three different files and they are not
 * interchangeable, so each gets its own slot that says what it wants and what
 * it is currently holding, rather than one pile the app has to guess at.
 */
export function FileSlot({
  title,
  hint,
  icon,
  accept,
  multiple = false,
  loaded,
  busy,
  onFiles,
  onClear,
  clearNoun = "this",
  children,
}: {
  title: string;
  hint: string;
  icon: IconName;
  accept: string;
  multiple?: boolean;
  loaded: boolean;
  busy?: boolean;
  onFiles: (files: File[]) => void;
  onClear?: () => void;
  /** What Clear throws away, named in the confirmation. */
  clearNoun?: string;
  children?: ReactNode;
}) {
  const [dragging, setDragging] = useState(false);
  /*
   * Clear throws away everything the slot holds, and on the sheets slot that
   * is the whole month. It asks first, the same way removing one sheet does.
   */
  const [confirming, setConfirming] = useState(false);
  const input = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!confirming) return;
    const t = window.setTimeout(() => setConfirming(false), 4000);
    return () => window.clearTimeout(t);
  }, [confirming]);

  return (
    <div
      onDragOver={(e) => {
        e.preventDefault();
        setDragging(true);
      }}
      onDragLeave={() => setDragging(false)}
      onDrop={(e) => {
        e.preventDefault();
        setDragging(false);
        onFiles([...e.dataTransfer.files]);
      }}
      className={`surface-card flex flex-col rounded-2xl border-2 border-dashed bg-white p-4 transition-[border-color,background-color] duration-150 ease-out ${
        dragging ? "border-gold bg-gold-050" : loaded ? "border-transparent" : "border-hairline"
      }`}
    >
      <div className="flex items-start gap-3">
        <span
          className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-full ${
            loaded ? "bg-teal text-white" : "bg-navy-050 text-navy"
          }`}
        >
          <Icon name={loaded ? "check-circle" : icon} size={18} />
        </span>
        <div className="min-w-0 flex-1">
          <h3 className="text-sm font-bold text-navy">{title}</h3>
          <p className="mt-0.5 text-xs leading-relaxed text-slate-ink">{hint}</p>
        </div>
      </div>

      <div className="mt-3 min-w-0 flex-1">{children}</div>

      <input
        ref={input}
        type="file"
        accept={accept}
        multiple={multiple}
        className="hidden"
        onChange={(e) => {
          const files = [...(e.target.files ?? [])];
          e.target.value = "";
          onFiles(files);
        }}
      />
      <div className="mt-3 flex flex-wrap items-center gap-2">
        <button
          type="button"
          disabled={busy}
          onClick={() => input.current?.click()}
          className="rounded-md bg-navy px-3 py-1.5 text-xs font-bold text-white transition-[background-color,scale] duration-150 ease-out hover:bg-navy-600 active:scale-[0.96] disabled:opacity-60"
        >
          {busy ? "Reading…" : loaded ? "Replace" : "Choose file"}
        </button>
        {loaded && onClear && (
          <button
            type="button"
            onClick={() => {
              if (!confirming) {
                setConfirming(true);
                return;
              }
              setConfirming(false);
              onClear();
            }}
            onBlur={() => setConfirming(false)}
            className={`rounded-md px-2 py-1.5 text-xs font-medium transition-colors duration-150 ${
              confirming
                ? "bg-[#B3261E] text-white"
                : "text-slate-ink hover:text-navy"
            }`}
          >
            {confirming ? `Clear ${clearNoun} \u2014 sure?` : "Clear"}
          </button>
        )}
      </div>
    </div>
  );
}
