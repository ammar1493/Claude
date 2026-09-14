/**
 * Handing a generated file to whoever is using the page.
 *
 * On its own origin that is an anchor with a download attribute. Inside the
 * claude.ai artifact viewer the page is sandboxed and an anchor download is
 * inert, so the platform's `downloads` capability asks the viewer instead —
 * same file, one confirmation. The page cannot tell which host it is in until
 * it asks, so it asks, and falls back.
 */

interface DownloadsNamespace {
  save(request: { filename: string; data: Blob | ArrayBuffer | string }): Promise<{ status: string }>;
}

interface ClaudeHost {
  use(name: string): Promise<DownloadsNamespace | null>;
}

function host(): ClaudeHost | null {
  const claude = (globalThis as { claude?: ClaudeHost }).claude;
  return claude && typeof claude.use === "function" ? claude : null;
}

export type SaveOutcome = "saved" | "declined" | "downloaded" | "failed";

/** True once a viewer has said no, so the page stops offering what it cannot do. */
let viewerDeclined = false;

export async function saveFile(filename: string, data: Blob): Promise<SaveOutcome> {
  const claude = host();
  if (claude) {
    try {
      const downloads = await claude.use("downloads");
      if (downloads) {
        await downloads.save({ filename, data });
        return "saved";
      }
    } catch (err) {
      const code = (err as { code?: string })?.code;
      // "declined" is an answer, not a failure; anything else falls through to
      // the ordinary download, which may be all this host supports.
      if (code === "declined") {
        viewerDeclined = true;
        return "declined";
      }
    }
  }

  try {
    const url = URL.createObjectURL(data);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    // Chromium only honours the download attribute on an anchor in the
    // document, and drops a filename carrying anything outside plain ASCII.
    a.style.display = "none";
    document.body.append(a);
    a.click();
    a.remove();
    window.setTimeout(() => URL.revokeObjectURL(url), 30_000);
    return "downloaded";
  } catch {
    return "failed";
  }
}

export function lastSaveWasDeclined(): boolean {
  return viewerDeclined;
}
