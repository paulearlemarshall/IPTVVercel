"use client";

import { useRef, useState } from "react";
import { localHelperSpec, type HelperPlatform } from "@/lib/local-helper-spec";

export default function PlayerAIHelp({ sourceUrl }: { sourceUrl: string }) {
  const dialog = useRef<HTMLDialogElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const [platform, setPlatform] = useState<HelperPlatform>("Windows");
  const [origin, setOrigin] = useState("");
  const [feedback, setFeedback] = useState("");
  let host = "";
  try { host = new URL(sourceUrl).host; } catch { /* The spec retains a safe placeholder. */ }
  const spec = localHelperSpec(platform, origin, host);
  const buttonClass = "rounded border border-white/25 bg-white/10 px-3 py-2 text-sm text-white hover:bg-white/20 focus-visible:outline focus-visible:outline-2 focus-visible:outline-blue-400";
  const copy = async (target: HelperPlatform) => {
    setPlatform(target);
    try {
      await navigator.clipboard.writeText(localHelperSpec(target, origin, host));
      setFeedback(`${target} instructions copied. Paste them into your AI assistant.`);
    } catch {
      setFeedback("Clipboard unavailable. Select and copy the instructions below manually.");
    }
  };
  return <>
    <button ref={trigger} type="button" className={buttonClass} onClick={() => {
      setOrigin(window.location.origin);
      setFeedback("");
      dialog.current?.showModal();
    }}>AI help</button>
    <dialog ref={dialog} onClose={() => trigger.current?.focus()} aria-labelledby="player-ai-help-title" className="fixed inset-0 m-auto max-h-[90dvh] w-[min(56rem,94vw)] overflow-auto rounded-xl border border-white/20 bg-gray-950 p-5 text-white shadow-xl backdrop:bg-black/80" onKeyDown={(event) => {
      // Let the native dialog close on Escape without also closing playback.
      if (event.key === "Escape") event.stopPropagation();
    }}>
      <div className="flex items-start justify-between gap-4">
        <h2 id="player-ai-help-title" className="text-xl font-semibold">AI help: build your local playback helper</h2>
        <button type="button" autoFocus className={buttonClass} onClick={() => dialog.current?.close()}>Close</button>
      </div>
      <p className="my-3 text-sm text-gray-200">Copy the complete instructions for your computer and paste them into your AI assistant. It can build a compatible helper without access to this project.</p>
      <p className="mb-4 text-sm text-gray-300">Includes this website’s origin and the current provider’s hostname only—no stream URL or credentials. Each copy includes the full protocol, conversion settings, setup and tests.</p>
      <div className="flex flex-wrap gap-2">
        {(["Windows", "macOS", "Linux"] as const).map(target => <button key={target} type="button" className={buttonClass} onClick={() => void copy(target)}>Copy for {target}</button>)}
      </div>
      <p role="status" className="my-3 min-h-5 text-sm text-emerald-300">{feedback}</p>
      <label htmlFor="helper-spec" className="mb-2 block text-sm font-semibold">Complete specification — {platform}</label>
      <textarea id="helper-spec" readOnly value={spec} spellCheck={false} className="h-[45dvh] w-full resize-y rounded border border-white/25 bg-gray-900 p-3 font-mono text-xs leading-relaxed text-gray-100 focus:outline focus:outline-2 focus:outline-blue-400" />
    </dialog>
  </>;
}
