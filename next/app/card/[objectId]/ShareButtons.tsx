"use client";

import { useEffect, useState } from "react";

import { btn } from "@/app/components/ui";

export default function ShareButtons({
  shareUrl,
  shareText,
  shareLabel,
  copyLabel,
  copiedLabel,
}: {
  shareUrl: string;
  shareText: string;
  shareLabel: string;
  copyLabel: string;
  copiedLabel: string;
}) {
  const [copied, setCopied] = useState(false);
  const [canShare, setCanShare] = useState(false);

  useEffect(() => {
    setCanShare(typeof navigator !== "undefined" && !!navigator.share);
  }, []);

  const handleShare = async () => {
    if (navigator.share) {
      try {
        await navigator.share({ text: shareText, url: shareUrl });
      } catch {
        // user cancelled — do nothing
      }
    } else {
      try {
        await navigator.clipboard.writeText(`${shareText} ${shareUrl}`);
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
      } catch {
        // clipboard unavailable — fall back to opening the URL so the user can copy/share manually
        window.open(shareUrl, "_blank", "noopener,noreferrer");
      }
    }
  };

  return (
    <div className="grid">
      <button
        type="button"
        onClick={handleShare}
        className={btn.solid}
      >
        {canShare ? shareLabel : copied ? copiedLabel : copyLabel}
      </button>
    </div>
  );
}
