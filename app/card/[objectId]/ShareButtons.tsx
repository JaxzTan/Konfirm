"use client";

import { useEffect, useState } from "react";

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
      await navigator.clipboard.writeText(`${shareText} ${shareUrl}`);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  return (
    <div className="flex gap-3 mt-6">
      <button
        onClick={handleShare}
        className="flex-1 bg-[#1f4d3d] text-white rounded-xl py-3.5 font-bold text-sm"
      >
        {canShare ? shareLabel : copied ? copiedLabel : copyLabel}
      </button>
    </div>
  );
}
