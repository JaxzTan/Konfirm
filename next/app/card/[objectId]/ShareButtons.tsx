"use client";

import { useEffect, useState } from "react";

import { btn } from "@/app/components/ui";

/**
 * Shares the verdict as a PNG rather than a link.
 *
 * A forwarded WhatsApp message is an image, not a URL — a link asks the
 * recipient to tap through to a site they don't know, while an image travels
 * the same way the misinformation did. The card still carries the verify URL
 * in its footer, so the chain record stays one step away.
 *
 * Three rungs, in order: share sheet with the file attached, download, then
 * the original text+link share. Each is a real fallback for a browser that
 * can't do the one above it, not a preference.
 */
export default function ShareButtons({
  shareUrl,
  imageUrl,
  shareText,
  shareLabel,
  preparingLabel,
  copyLabel,
  copiedLabel,
}: {
  shareUrl: string;
  /** /api/card/[objectId] — generates the PNG on demand. */
  imageUrl: string;
  shareText: string;
  shareLabel: string;
  preparingLabel: string;
  copyLabel: string;
  copiedLabel: string;
}) {
  const [copied, setCopied] = useState(false);
  const [busy, setBusy] = useState(false);
  const [canShare, setCanShare] = useState(false);

  useEffect(() => {
    setCanShare(typeof navigator !== "undefined" && !!navigator.share);
  }, []);

  /** Rung 3: what this component did before there was an image. */
  const shareLink = async () => {
    if (navigator.share) {
      try {
        await navigator.share({ text: shareText, url: shareUrl });
      } catch {
        // user cancelled — do nothing
      }
      return;
    }
    try {
      await navigator.clipboard.writeText(`${shareText} ${shareUrl}`);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      window.open(shareUrl, "_blank", "noopener,noreferrer");
    }
  };

  const handleShare = async () => {
    if (busy) return;
    setBusy(true);

    try {
      const response = await fetch(imageUrl);
      if (!response.ok) throw new Error(`card image returned ${response.status}`);

      const file = new File([await response.blob()], "konfirm.png", { type: "image/png" });

      // canShare({ files }) is the only honest test: Web Share level 2 is
      // absent on most desktop browsers, and some that expose navigator.share
      // still refuse files.
      if (navigator.canShare?.({ files: [file] })) {
        try {
          // The verify link goes in `text`, not the separate `url` field —
          // most platforms silently drop `url` when `files` is also present,
          // while plain text always comes through as the share's caption.
          await navigator.share({ files: [file], text: `${shareText} ${shareUrl}` });
        } catch {
          // user cancelled — not a failure, and must not fall through to a
          // surprise download.
        }
        return;
      }

      // Rung 2: hand over the file itself. Nothing else on this device can
      // put an image into a chat app for us.
      const objectUrl = URL.createObjectURL(file);
      const link = document.createElement("a");
      link.href = objectUrl;
      link.download = "konfirm.png";
      link.click();
      URL.revokeObjectURL(objectUrl);
    } catch {
      await shareLink();
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="grid">
      <button
        type="button"
        onClick={handleShare}
        disabled={busy}
        className={busy ? btn.disabled : btn.solid}
      >
        {busy ? preparingLabel : canShare ? shareLabel : copied ? copiedLabel : copyLabel}
      </button>
    </div>
  );
}
