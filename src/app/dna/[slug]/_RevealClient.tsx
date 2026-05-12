"use client";

// Share-button island for the reveal page. POSTs to /api/share-token with the
// archetype key + voice variant pulled from local storage, then copies the
// resulting share URL to the clipboard (or invokes the native share sheet).

import { useState } from "react";
import { Check, Copy, Share2 } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/cn";
import { readStoredDna } from "@/lib/dna/storage";

interface Props {
  archetypeKey: string;
  archetypeName: string;
}

export function RevealClient({ archetypeKey, archetypeName }: Props) {
  const [copied, setCopied] = useState(false);
  const [busy, setBusy] = useState(false);

  const handleShare = async () => {
    if (busy) return;
    setBusy(true);
    try {
      // Pull voiceVariant from stored DNA — required by the token endpoint.
      const stored = readStoredDna();
      const voiceVariant = stored?.voiceVariant ?? "warm";

      let url = `${window.location.origin}/dna/${archetypeKey}`;
      try {
        const res = await fetch(`/api/share-token`, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ archetypeKey, voiceVariant }),
        });
        if (res.ok) {
          const j = (await res.json()) as { token?: string };
          if (j.token) url = `${window.location.origin}/dna/${archetypeKey}?t=${j.token}`;
        }
      } catch {
        // Network error — fall through with the unminted URL.
      }

      if (typeof navigator !== "undefined" && "share" in navigator) {
        try {
          await navigator.share({
            title: `I'm a ${archetypeName} on stream·score`,
            text: `My stream·score DNA: ${archetypeName}.`,
            url,
          });
          return;
        } catch {
          // user dismissed — fall through to clipboard
        }
      }

      await navigator.clipboard.writeText(url);
      setCopied(true);
      toast.success("Link copied to clipboard");
      setTimeout(() => setCopied(false), 2400);
    } catch (err) {
      console.error("[dna] share failed", err);
      toast.error("Couldn't copy that — try again");
    } finally {
      setBusy(false);
    }
  };

  return (
    <button
      type="button"
      onClick={handleShare}
      disabled={busy}
      className={cn(
        "inline-flex items-center gap-2 rounded-full border border-[var(--color-border-strong)] bg-[var(--color-bg-elevated)]/70",
        "px-4 py-2 text-[13px] text-[var(--color-text)]/90 transition hover:bg-[var(--color-surface)]",
        "disabled:cursor-wait disabled:opacity-60",
      )}
    >
      {copied ? (
        <>
          <Check className="h-4 w-4 text-[var(--color-good)]" />
          Copied
        </>
      ) : (
        <>
          {typeof navigator !== "undefined" && "share" in navigator ? (
            <Share2 className="h-4 w-4" />
          ) : (
            <Copy className="h-4 w-4" />
          )}
          Share my DNA
        </>
      )}
    </button>
  );
}
