import type { ReactNode } from "react";
import { headingFont, type Locale } from "@/lib/locale";

/* Design tokens live as Tailwind arbitrary values so there is one obvious
   place to read a hex off — see docs/pages-design-brief.md for the table. */

export const btn = {
  solid:
    "w-full rounded-xl px-4 py-[14px] text-[15.5px] font-semibold leading-[1.3] text-center bg-[#1f4d3d] text-[#f7f5ef] hover:bg-[#0f2e23] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#1f4d3d] focus-visible:ring-offset-2 transition-colors",
  outline:
    "w-full rounded-xl px-4 py-[14px] text-[15.5px] font-semibold leading-[1.3] text-center border border-[#d1d5db] text-[#0f2e23] hover:bg-[#f7f5ef] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#1f4d3d] focus-visible:ring-offset-2 transition-colors",
  disabled:
    "w-full rounded-xl px-4 py-[14px] text-[15.5px] font-semibold leading-[1.3] text-center bg-[#c9c9c4] text-[#f7f5ef] cursor-not-allowed",
} as const;

/** Uppercase mono label that sits above every section. */
export function Micro({ children }: { children: ReactNode }) {
  return (
    <p className="font-mono text-[10.5px] uppercase tracking-[0.15em] text-[#6b7280]">
      {children}
    </p>
  );
}

export function Serif({
  locale,
  size,
  className = "",
  children,
}: {
  locale: Locale;
  size: number;
  className?: string;
  children: ReactNode;
}) {
  return (
    <h2
      style={{ fontSize: size }}
      className={`${headingFont(locale)} leading-[1.25] ${className}`}
    >
      {children}
    </h2>
  );
}

const TONE = {
  t: "bg-[#edf7f0] border-[#cfe3d6] text-[#1f5738]",
  f: "bg-[#fdf0ed] border-[#f2d5cc] text-[#6b3527]",
} as const;

export type Tone = keyof typeof TONE;

export function Chip({ tone, children }: { tone: Tone; children: ReactNode }) {
  return (
    <span className={`rounded-full border px-[11px] py-[6px] text-[12px] leading-[1.35] ${TONE[tone]}`}>
      {children}
    </span>
  );
}

/** Brass "only N models participated" notice. Always on a dark ground. */
export function Warn({ children }: { children: ReactNode }) {
  return (
    <div className="rounded-[10px] border border-[#c98a3a]/40 bg-[#c98a3a]/20 px-[13px] py-[10px] text-[12.5px] leading-[1.45] text-[#f0d9a8]">
      {children}
    </div>
  );
}

/**
 * 96px score ring. The unfilled track is cream at 16% because this only ever
 * renders on the ink gradient — a gray track disappears against it.
 */
export function Donut({ score, tone, locale }: { score: number; tone: Tone; locale: Locale }) {
  const fill = tone === "t" ? "#5fbf8f" : "#e08a6f";
  return (
    <div
      className="flex h-24 w-24 flex-none items-center justify-center rounded-full"
      style={{ background: `conic-gradient(${fill} ${score}%, rgba(247,245,239,0.16) 0)` }}
      role="img"
      aria-label={`${score}%`}
    >
      <div
        className={`flex h-[74px] w-[74px] items-center justify-center rounded-full bg-[#0f2e23] text-[24px] text-[#f7f5ef] ${headingFont(locale)}`}
      >
        {score}%
      </div>
    </div>
  );
}

export function Spinner({
  locale,
  title,
  sub,
}: {
  locale: Locale;
  title: string;
  sub: string;
}) {
  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-[14px] px-6 py-[60px] text-center">
      <div
        className="h-[34px] w-[34px] animate-spin rounded-full border-[3px] border-[#d1d5db] border-t-[#1f4d3d]"
        role="status"
        aria-label={title}
      />
      <Serif locale={locale} size={20} className="text-[#0f2e23]">
        {title}
      </Serif>
      <p className="text-[14px] leading-[1.65] text-[#6b7280]">{sub}</p>
    </div>
  );
}

export type ModelResult = {
  name: string;
  score: string;
  /** One bullet per reasoning point — rendered as a list, not one paragraph. */
  reasoning: string[];
  requestId: string;
};

export function ModelCard({ model }: { model: ModelResult }) {
  return (
    <div className="grid gap-[7px] rounded-xl border border-[#d1d5db] bg-[#f7f5ef] px-[14px] py-[13px]">
      <div className="flex items-center gap-2">
        <span className="flex-1 text-[14px] font-semibold text-[#0f2e23]">{model.name}</span>
        <span className="rounded-full bg-[#ece9e0] px-[9px] py-[3px] text-[12px] font-semibold text-[#0f2e23]">
          {model.score}
        </span>
      </div>
      <ul className="grid list-disc gap-1 pl-[18px] text-[13px] leading-[1.55] text-[#6b7280]">
        {model.reasoning.map((point, i) => (
          <li key={i}>{point}</li>
        ))}
      </ul>
      <p className="border-t border-dashed border-[#d1d5db] pt-[7px] font-mono text-[10.5px] text-[#6b7280]">
        {model.requestId}
      </p>
    </div>
  );
}

/** Key signals + per-model cards. Shared by the result panel and /v. */
export function SignalsAndModels({
  labels,
  signals,
  tone,
  models,
}: {
  labels: { signals: string; models: string };
  signals: string[];
  tone: Tone;
  models: ModelResult[];
}) {
  return (
    <>
      <div className="grid gap-[10px]">
        <Micro>{labels.signals}</Micro>
        <div className="flex flex-wrap gap-[7px]">
          {signals.map((s) => (
            <Chip key={s} tone={tone}>
              {s}
            </Chip>
          ))}
        </div>
      </div>
      <div className="grid gap-[10px]">
        <Micro>{labels.models}</Micro>
        <div className="grid gap-[9px]">
          {models.map((m) => (
            <ModelCard key={m.name} model={m} />
          ))}
        </div>
      </div>
    </>
  );
}

/** Bordered result panel: ink gradient head over a white body. */
export function Panel({ head, children }: { head: ReactNode; children: ReactNode }) {
  return (
    <div className="mx-4 my-[18px] overflow-hidden rounded-2xl border border-[#d1d5db] bg-white">
      <div className="grid gap-[14px] bg-gradient-to-b from-[#0f2e23] to-[#1f4d3d] px-5 py-[22px]">
        {head}
      </div>
      <div className="grid gap-[18px] p-5">{children}</div>
    </div>
  );
}

export function GoogleMark() {
  return (
    <span
      className="h-[18px] w-[18px] flex-none rounded-full"
      style={{
        background:
          "conic-gradient(#ea4335 0 25%, #fbbc05 0 50%, #34a853 0 75%, #4285f4 0)",
      }}
    />
  );
}
