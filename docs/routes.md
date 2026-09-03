# Konfirm — route map

Every screen is a real route. `?lang=bm|zh` works on all of them (English is
the default and carries no param).

| # | Route | Screen |
|---|---|---|
| 01 | `/` | Text input |
| 02 | `/link` | Link input |
| 03 | `/photo` | Photo dropzone |
| 04 | `/checking` | Checking with AI models |
| 05 | `/signin` | Gate — the result is never shown before this |
| 06 | `/confirm` | Confirm on-chain — the only explicit consent moment |
| 07 | `/attesting` | Saving on-chain |
| 08 | `/failed` | Attest error (replaces the raw `alert()`) |
| 09 | `/result/false` | Likely false · 25% |
| 10 | `/result/true` | Likely true · 88% |
| 11 | `/result/disputed` | Two positions, no score |
| 12 | `/result/unverifiable` | Dashed empty state |
| 13 | `/result/insufficient` | Models timed out |
| 14 | `/login` | Standalone entry — ink over cream, Google only |
| 15 | `/card/[objectId]` | Share card |
| 16 | `/v/[objectId]` | Public record, no login |

`/result/[state]` enumerates its five segments with `generateStaticParams` and
`dynamicParams = false`, so `/result/banana` is a real 404 with a 404 status.
Calling `notFound()` from the component instead renders the 404 page but still
answers 200, because the layout streams behind a Suspense boundary and the
status is already on the wire.

`/signin` and `/login` are both sign-in screens and are deliberately separate:
`/login` is the standalone entry point and returns you to `/`, while `/signin`
is the mid-flow gate and hands off to `/confirm`.

## How the flow holds together

Screens 01–13 live in the `app/(check)` route group. Its layout is not
remounted when the user moves between its children, so the claim text, the
verdict and the pending transaction live in a context there rather than in any
page:

| File | Role |
|---|---|
| `(check)/layout.tsx` | Server. Suspense boundary over the shell |
| `(check)/Shell.tsx` | Client. Reads `?lang=`, mounts the provider |
| `(check)/flow.tsx` | The flow state, `check()`, `attest()`, `reset()` |
| `(check)/Chrome.tsx` | Header + hero, shared by every screen |
| `(check)/InputBody.tsx` | Screens 01–03; the tabs are `<Link>`s to routes |
| `(check)/ResultPanel.tsx` | Screens 09–13 |

A layout never receives `searchParams` — only pages do — so the locale is read
in `Shell.tsx` (a client component) rather than in `layout.tsx`.

Landing on a mid-flow route cold (a shared link, a refresh) leaves the flow
state empty and the screen falls back to the fixture set in `lib/fixtures.ts`.
That is what makes every designed screen reviewable without walking the flow —
and it means `/attesting` opened directly is a spinner with nothing behind it,
which is the accepted cost of giving transient states their own URLs.

## Outside the group

`/login`, `/card/[objectId]` and `/v/[objectId]` are server components with
their own chrome. They use `createTranslator` directly; the flow routes use
`NextIntlClientProvider` from `Shell.tsx`. `app/error.tsx`, `not-found.tsx`
and `loading.tsx` cover the whole app.

## Handoff gaps closed

- Screen 08 replaces the raw `alert()`; `app/error.tsx` mirrors it route-wide.
- Screen 10 (likely true) added.
- `not-found.tsx` and `loading.tsx` added — `notFound()` on `/card` and `/v`
  no longer falls through to the Next.js default 404.
- zh headings use Noto Serif SC, so the serif voice survives in Chinese.
- `/login` commits to the stacked layout rather than a split screen the 440px
  lock can never fire.

## Still open

- `/card` and `/v` render the fixture verdict. The Sui fullnode read by object
  ID is a TODO in both files.
- The breakpoint override in `globals.css` stands, so the remaining `sm:`
  classes elsewhere in the tree are still dead code.
