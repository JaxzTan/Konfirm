# Reading a Verdict's data (chain + Walrus)

How to pull the full record for any attested verdict, and verify the two
sources agree. Written 2026-09-05 against testnet.

A verdict is stored in two places on purpose:

- **Sui** holds the *record* — hashes, scores, model names, request IDs. All
  `u8`s and short strings, so it is cheap to keep in consensus forever.
- **Walrus** holds the *prose* — the claim, the title, the description, the
  signals, each model's reasoning. Too big and too soft for the chain.

`Verdict.trace_blob` (`move/sources/registry.move:55`) is the pointer between
them. Verification means fetching both and checking they line up.

## The two commands

```bash
sui client object 0xb593f8c326a871cd8fb7c81fb3e029fc32660b24ca6d3a63fa2f6c444e6474f0 --json

curl -s https://aggregator.walrus-testnet.walrus.space/v1/blobs/c12_mtRjTwG7R4mwNBcFusBG5ZyGYgG3Ia-DzC0GS4c | jq .
```

That object and that blob are a real attested verdict, kept here as a worked
example — a zh check of "牛油果帮助排便？".

## 1. `sui client object` — the chain side

Point the CLI at the right network first. Every command below fails
confusingly against mainnet:

```bash
sui client envs                    # * marks the active env; must be testnet
sui client switch --env testnet
```

`--json` is not optional in practice — without it you get a human-readable
table that is painful to pipe anywhere.

### What comes back

| field | meaning |
|---|---|
| `objType` | `<packageId>::registry::Verdict` — proves it is our contract's type, not a lookalike |
| `owner: Shared` | anyone can read it and call `challenge` on it; nobody owns it |
| `version` / `digest` | bump on every mutation. `challenge_count` is the only mutable field |
| `prevTx` | the transaction that last wrote it — feed to `sui client tx-block` |
| `content` | the struct fields themselves |

Inside `content`, the three that matter for verification:

- **`claim_hash`** — base64 of `sha256(normalize(text) || lang)`. See
  `next/lib/attest/claimHash.ts` for the normalization. The chain never stores
  the raw text.
- **`lang`** — `0` = en, `1` = ms, `2` = zh.
- **`trace_blob`** — the Walrus blob ID. This is the bridge to step 2.

`state` is `0` = verdict, `1` = disputed, `2` = unverifiable, `3` =
insufficient; `score` is `255` (`NO_SCORE`) for anything but state `0`.

## 2. `curl` the aggregator — the Walrus side

Walrus exposes two endpoints and they are **not** interchangeable:

| | URL | verb | used by |
|---|---|---|---|
| publisher | `publisher.walrus-testnet.walrus.space` | `PUT /v1/blobs` | our server, `next/lib/attest/walrus.ts` — writes |
| aggregator | `aggregator.walrus-testnet.walrus.space` | `GET /v1/blobs/<id>` | anyone — reads |

Both are in `.env` as `WALRUS_PUBLISHER` and `NEXT_PUBLIC_WALRUS_AGGREGATOR`.

**There is no auth on the read.** Anyone with the blob ID — which is public on
chain — can fetch the full trace. That is what the sign-in copy
(`App.gateBody`) warns about, and it is why `redactDeep` runs over the payload
before upload.

`jq .` pretty-prints and decodes `\uXXXX` escapes into readable CJK. Without it
the response is one dense line of escapes.

### Blob shape

```jsonc
{
  "state": "true",           // matches the chain's numeric state
  "score": 100,
  "tone": "t",
  "title": "很可能是真的",
  "description": "…",
  "signals": ["…"],          // LLM prose, in the check's language
  "models": [{ "name": "MiniMax", "score": "100%", "reasoning": "…", "requestId": "…" }],
  "modelCount": 3,
  "claim": "牛油果帮助排便？",  // the message that was checked
  "attestedAt": "2026-09-05T04:00:24.322Z"
}
```

`claim` was added on **2026-09-05**. Records attested before that have no
`claim` field, and never will — blobs are immutable. `/v/[objectId]` falls back
to showing only the claim fingerprint for those.

## 3. How they connect

```
sui client object 0xb593…   →   trace_blob: "c12_mtRj…"
                                      ↓
curl …/v1/blobs/c12_mtRj…   →   { claim, title, description, signals, models }
```

A record verifies when the two agree:

| | chain | blob |
|---|---|---|
| verdict | `state: 0`, `score: 100` | `"state": "true"`, `"score": 100` |
| language | `lang: 2` | Chinese throughout |
| models | MiniMax, Gemini 3.1, Gemini 3.5 | same three, same order |
| request IDs | three Gonka/Gemini IDs | identical three |
| claim | `claim_hash: MOcWw9dlZ70…` | `claim: 牛油果帮助排便？` |

`models` and `request_ids` are positional against each other in
`create_verdict`, so order is part of the check, not incidental.

## 4. Finding object IDs from scratch

Verdicts are **shared** objects, so `sui client objects` will not list them —
they are not owned by the attester. Query the `VerdictCreated` event instead.

This needs gRPC: public JSON-RPC fullnodes were shut down 2026-07-31 and every
method now returns `Method not found`. `next/lib/sui/client.ts` already uses
`SuiGrpcClient` for this reason.

Run from `next/`, where `@mysten/sui` resolves:

```js
// listmine.mjs — node listmine.mjs
import { SuiGrpcClient } from '@mysten/sui/grpc';

const c = new SuiGrpcClient({ network: 'testnet', baseUrl: 'https://fullnode.testnet.sui.io:443' });
const PKG  = process.env.NEXT_PUBLIC_PACKAGE_ID;
const ADDR = '<your address — sui client active-address>';

const page = await c.core.listEvents({ filter: { sender: ADDR }, limit: 50 });
for (const e of page.events ?? []) {
  if (e.eventType !== `${PKG}::registry::VerdictCreated`) continue;
  console.log(e.json.verdict_id, e.transactionDigest);
}
```

The filter takes **exactly one** predicate — `sender` or `eventType`, never
both; the SDK's `assertSinglePredicate` rejects the pair. So filter by sender at
the node and by type in JS. Same constraint `next/lib/sui/history.ts:39-42`
documents.

## 5. Recipes

```bash
AGG=https://aggregator.walrus-testnet.walrus.space/v1/blobs

# just the question that was checked
curl -s $AGG/<blobId> | jq -r .claim

# the chain fields that matter, in one line
sui client object <objectId> --json \
  | jq '{lang:.content.lang, state:.content.state, score:.content.score, blob:.content.trace_blob}'

# does this record predate the claim feature?
curl -s $AGG/<blobId> | jq 'has("claim")'

# chase the pointer end to end
BLOB=$(sui client object <objectId> --json | jq -r .content.trace_blob)
curl -s $AGG/$BLOB | jq .
```

## Known data defects

- **`spread_lo` / `spread_hi` are 0 on almost every record.**
  `next/lib/fixtures.ts` stores each model's score as a display string
  (`` `${m.score}%` ``), so `Math.min(...)` in
  `next/lib/attest/verdictArgs.ts:41-46` returns `NaN`, and `tx.pure.u8(NaN)`
  writes `0`. Confirmed against four of five live records. Immutable once
  written — fixable only going forward.
- **Blobs can expire.** Walrus stores for a bounded number of epochs
  (`WALRUS_EPOCHS`). A verdict whose blob has lapsed still reads from chain;
  `/v/[objectId]` degrades to the fingerprint and shows `traceUnavailable`.
