'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';

import { readCache, writeCache, type CachedVerdict } from '@/lib/history/cache';
import { useKonfirmIdentity } from '@/lib/signer';
import { fetchWalletVerdicts, mergeHistory, type HistoryEntry } from '@/lib/sui/history';
import { STATE_VERDICT, STATE_DISPUTED, STATE_INSUFFICIENT } from '@/lib/sui/verdict';
import type { Locale } from '@/lib/locale';
import { TIME_ZONE } from '@/lib/locale';

export type HistoryLabels = {
  signedOut: string;
  empty: string;
  loading: string;
  offline: string;
  pending: string;
  blob: string;
  copy: string;
  copied: string;
  view: string;
  challenges: (count: number) => string;
  verdictTrue: string;
  verdictFalse: string;
  verdictDisputed: string;
  verdictUnverifiable: string;
  verdictInsufficient: string;
  signIn: string;
};

const DATE_LOCALE: Record<Locale, string> = { en: 'en-MY', bm: 'ms-MY', zh: 'zh-CN' };

/**
 * Same mapping the verify page uses, minus the Walrus trace.
 *
 * `/v/[objectId]` reads the original "true"/"false" string out of the trace
 * because the chain deliberately collapses both into STATE_VERDICT. Doing
 * that here would mean one Walrus fetch per row, so the list falls back to
 * the score threshold — the label can differ from the record page in the rare
 * case where a trace disagrees with its own score, and the record page wins.
 */
function label(entry: HistoryEntry, labels: HistoryLabels): { text: string; tone: 'good' | 'bad' | 'flat' } {
  switch (entry.state) {
    case STATE_VERDICT:
      return entry.score !== null && entry.score >= 50
        ? { text: labels.verdictTrue, tone: 'good' }
        : { text: labels.verdictFalse, tone: 'bad' };
    case STATE_DISPUTED:
      return { text: labels.verdictDisputed, tone: 'flat' };
    case STATE_INSUFFICIENT:
      return { text: labels.verdictInsufficient, tone: 'flat' };
    default:
      return { text: labels.verdictUnverifiable, tone: 'flat' };
  }
}

const TONE_CLASS = {
  good: 'bg-[#edf7f0] border-[#cfe3d6] text-[#1f5738]',
  bad: 'bg-[#fdf0ed] border-[#f2d5cc] text-[#6b3527]',
  flat: 'bg-[#f3f4f6] border-[#e5e7eb] text-[#4b5563]',
} as const;

function BlobId({ blobId, labels }: { blobId: string; labels: HistoryLabels }) {
  const [copied, setCopied] = useState(false);

  // navigator.clipboard is undefined on insecure origins and can reject when
  // the document isn't focused; the id stays selectable either way, so a
  // failed copy just leaves the button label alone.
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(blobId);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      /* no-op */
    }
  };

  return (
    <div className="grid gap-[5px]">
      <p className="font-mono text-[10px] uppercase tracking-[0.14em] text-[#6b7280]">
        {labels.blob}
      </p>
      <div className="flex items-start gap-2">
        <code className="min-w-0 flex-1 break-all font-mono text-[11.5px] leading-[1.45] text-[#374151]">
          {blobId}
        </code>
        <button
          type="button"
          onClick={copy}
          className="shrink-0 rounded-lg border border-[#d1d5db] px-[9px] py-[3px] text-[11px] text-[#374151] hover:bg-[#f7f5ef]"
        >
          {copied ? labels.copied : labels.copy}
        </button>
      </div>
    </div>
  );
}

/**
 * Renders the cached rows on first paint, then reconciles against the chain.
 *
 * The two-source design is what makes this useful on a phone the user has
 * never signed in on (chain) without a blank screen on the one they always
 * use (cache) — see lib/history/cache.ts.
 */
export function HistoryList({ locale, labels }: { locale: Locale; labels: HistoryLabels }) {
  const { address } = useKonfirmIdentity();
  const [entries, setEntries] = useState<HistoryEntry[]>([]);
  const [loading, setLoading] = useState(false);
  const [offline, setOffline] = useState(false);

  useEffect(() => {
    if (!address) {
      setEntries([]);
      return;
    }

    const cached = readCache(address);
    setEntries(mergeHistory(cached, []));
    setLoading(true);
    setOffline(false);

    // Guards against a sign-out or account switch landing an older response
    // on top of a newer one.
    let current = true;

    fetchWalletVerdicts(address)
      .then((chain) => {
        if (!current) return;
        setEntries(mergeHistory(cached, chain));
        // An empty result with a non-empty cache is the ambiguous case: it
        // means either "the node is unreachable" or "nothing is indexed yet".
        // Both warrant the same caveat, since the rows on screen came from
        // this device rather than the record of truth.
        setOffline(chain.length === 0 && cached.length > 0);

        if (chain.length > 0) {
          const merged: CachedVerdict[] = chain.map((v) => ({
            objectId: v.objectId,
            traceBlob: v.traceBlob,
            state: v.state,
            score: v.score,
            savedAtMs: v.createdAtMs,
          }));
          writeCache(address, merged);
        }
      })
      .finally(() => {
        if (current) setLoading(false);
      });

    return () => {
      current = false;
    };
  }, [address]);

  if (!address) {
    return (
      <div className="grid gap-4">
        <p className="text-[14px] leading-[1.65] text-[#6b7280]">{labels.signedOut}</p>
        <Link
          href={`/login?lang=${locale}`}
          className="rounded-xl bg-[#1f4d3d] px-4 py-[14px] text-center text-[15.5px] font-semibold text-[#f7f5ef] hover:bg-[#0f2e23]"
        >
          {labels.signIn}
        </Link>
      </div>
    );
  }

  if (entries.length === 0) {
    return (
      <p className="text-[14px] leading-[1.65] text-[#6b7280]">
        {loading ? labels.loading : labels.empty}
      </p>
    );
  }

  return (
    <div className="grid gap-3">
      {loading && <p className="text-[12.5px] text-[#6b7280]">{labels.loading}</p>}
      {!loading && offline && (
        <p className="rounded-xl border border-[#f0e0c0] bg-[#fdf8ee] px-[13px] py-[10px] text-[12.5px] leading-[1.5] text-[#6b5327]">
          {labels.offline}
        </p>
      )}

      {entries.map((entry) => {
        const { text, tone } = label(entry, labels);
        return (
          <article
            key={entry.objectId}
            className="grid gap-[11px] rounded-2xl border border-[#e5e7eb] bg-white p-[15px]"
          >
            <div className="flex items-center justify-between gap-3">
              <span className={`rounded-full border px-[11px] py-[5px] text-[12px] ${TONE_CLASS[tone]}`}>
                {text}
                {entry.score !== null && ` · ${entry.score}`}
              </span>
              <time className="shrink-0 text-[11.5px] text-[#6b7280]">
                {new Date(entry.createdAtMs).toLocaleDateString(DATE_LOCALE[locale], {
                  dateStyle: 'medium',
                  timeZone: TIME_ZONE,
                })}
              </time>
            </div>

            <BlobId blobId={entry.traceBlob} labels={labels} />

            <div className="flex items-center justify-between gap-3">
              {entry.confirmed ? (
                <Link
                  href={`/v/${entry.objectId}?lang=${locale}`}
                  className="text-[13px] font-semibold text-[#1f4d3d] underline"
                >
                  {labels.view}
                </Link>
              ) : (
                <span className="text-[12px] text-[#9ca3af]">{labels.pending}</span>
              )}
              {entry.challengeCount !== null && entry.challengeCount > 0 && (
                <span className="text-[12px] text-[#6b3527]">
                  {labels.challenges(entry.challengeCount)}
                </span>
              )}
            </div>
          </article>
        );
      })}
    </div>
  );
}
