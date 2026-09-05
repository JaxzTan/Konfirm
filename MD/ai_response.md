Created MD/ with seven documents, all written from this repo's actual code (lib/enoki/sponsor.ts, lib/attest/*, lib/sui/*, move/sources/registry.move, docs/wallet.md) rather than generic tutorials — file paths are cited throughout so you can point at the source if a judge pushes.

┌───────────────────────────┬───────────────────────────────┐
│           File            │           Contents            │
├───────────────────────────┼───────────────────────────────┤
│                           │ Index + the 30-second version │
│ MD/README.md              │  + the three things people    │
│                           │ confuse                       │
├───────────────────────────┼───────────────────────────────┤
│                           │ zkLogin from scratch: JWT,    │
│ MD/01-zklogin.md          │ ephemeral key, nonce, salt,   │
│                           │ ZK proof, address derivation, │
│                           │  what Enoki adds              │
├───────────────────────────┼───────────────────────────────┤
│                           │ Walrus: erasure coding, blob  │
│ MD/02-walrus.md           │ IDs, publisher/aggregator,    │
│                           │ storage expiry, why not       │
│                           │ IPFS/S3                       │
├───────────────────────────┼───────────────────────────────┤
│ MD/03-gas-fees.md         │ Your leader's question, in    │
│                           │ full                          │
├───────────────────────────┼───────────────────────────────┤
│                           │ Exactly what data lands       │
│ MD/04-data-and-sharing.md │ where, and the share flow end │
│                           │  to end                       │
├───────────────────────────┼───────────────────────────────┤
│ MD/05-diagrams.md         │ Six Mermaid diagrams,         │
│                           │ slide-ready                   │
├───────────────────────────┼───────────────────────────────┤
│ MD/06-qna-cheatsheet.md   │ Rapid-fire Q&A including      │
│                           │ hostile questions             │
└───────────────────────────┴───────────────────────────────┘

Direct answers to your leader

1. Gas fees — there are three separate payments, not one.

┌──────────────────────┬──────────┬─────────────────────────┐
│         What         │ Currency │        Who pays         │
├──────────────────────┼──────────┼─────────────────────────┤
│ Walrus storage for   │          │ The publisher we call,  │
│ the reasoning trace  │ WAL      │ server-side from        │
│                      │          │ /api/attest             │
├──────────────────────┼──────────┼─────────────────────────┤
│ Sui gas for          │ SUI      │ Our Enoki sponsor pool  │
│ create_verdict       │          │                         │
├──────────────────────┼──────────┼─────────────────────────┤
│ Sui gas for          │          │ The challenger's own    │
│ challenge            │ SUI      │ wallet — deliberately   │
│                      │          │ not sponsored           │
├──────────────────────┼──────────┼─────────────────────────┤
│ Reading anything     │ —        │ Free                    │
└──────────────────────┴──────────┴─────────────────────────┘

The user holds 0 SUI and pays nothing. docs/wallet.md has the testnet evidence: three verdicts, three senders each at zero balance, all gas paid by 0x0dec4c7d…. Both facts together (balance 0 and gas payer ≠ sender) are what prove sponsorship.

Important nuance the docs already record: sponsorship is not an Enoki Portal allowlist flag. It needs the private key, so it needs a server — hence the three-leg flow in useSignAndExecuteTransaction.ts. That correction is in lib/enoki/sponsor.ts's header comment.

2. How Walrus works. A file is erasure-coded into slivers spread across independent storage nodes; any sufficiently large subset reconstructs it, so overhead is ~4–5× rather than full replication. The blob ID is content-derived, so a swapped trace produces a different ID and no longer matches the immutable on-chain field — that's the anti-tampering argument.

3. What's stored in Walrus. The full PII-redacted reasoning trace: descriptions, key signals, per-model reasoning and request IDs. On Sui goes only the summary plus the blob ID. The raw claim text is stored nowhere — only sha256(normalize(text) ‖ lang), hashed in the browser, so /api/attest never sees it.

4. Sharing. The Sui object ID is the permalink. /v/{objectId} (verification page) and /card/{objectId} (screenshot card) need no wallet, no login, no app. A sceptic can bypass Konfirm entirely — Suiscan for the object, any Walrus aggregator for the blob.

Two things I flagged rather than smoothed over, both already in your own docs: Walrus testnet blobs expire (one live verdict's trace already 404s — upload with more epochs before the pitch), and /card/[objectId] still returns stub data.
