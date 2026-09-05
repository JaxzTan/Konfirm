# MD/ — Konfirm explained for the pitch

Written for a team member who is **new to blockchain** but has to answer judges' questions
on stage. Every claim here was read out of this repository's own code and docs, not from
generic tutorials — file paths are cited so you can point at the source if challenged.

## Read in this order

| # | File | What it answers |
|---|---|---|
| 1 | [01-zklogin.md](01-zklogin.md) | What zkLogin is, how "Google login = a Sui wallet" actually works, what Enoki does for us |
| 2 | [02-walrus.md](02-walrus.md) | What Walrus is, how erasure coding works, what a blob ID is, why we use it instead of the chain |
| 3 | [03-gas-fees.md](03-gas-fees.md) | **The leader's question.** Who pays what, at which step — Sui gas, Walrus storage, challenge gas |
| 4 | [04-data-and-sharing.md](04-data-and-sharing.md) | Exactly what data goes where, and what happens when a user shares to WhatsApp |
| 5 | [05-diagrams.md](05-diagrams.md) | All flow diagrams in one place — for slides or a whiteboard |
| 6 | [06-qna-cheatsheet.md](06-qna-cheatsheet.md) | Rapid-fire Q&A, including the hostile questions and our honest limits |

## The 30-second version

Konfirm asks several AI models whether a forwarded message is true, then writes the
**result** somewhere nobody — including us — can edit it afterwards.

- The **verdict summary** (score, model names, timestamp) becomes an object on the **Sui**
  blockchain. Append-only: no update function, no delete function.
- The **full reasoning text** is too big for a blockchain, so it goes to **Walrus**,
  a decentralised storage network. Sui stores only the Walrus receipt (the blob ID).
- The user signs in with **Google** via **zkLogin**, which turns their Google account into a
  Sui wallet address. No seed phrase, no extension, no crypto knowledge.
- The user pays **zero gas**, because the transaction is **sponsored** by our Enoki gas pool.

> **The honest line, say it before a judge says it for you:** putting a verdict on-chain
> proves *the record was not edited afterwards*. It does **not** prove the verdict is
> correct. That is exactly why the contract also lets anyone attach a permanent
> `Challenge`.

## The three things people confuse

| Confusion | The correction |
|---|---|
| "zkLogin stores the data" | zkLogin is **identity only** — it produces a signature. Storage is Sui (summary) + Walrus (text). |
| "Walrus is a blockchain" | Walrus is **storage**. Its bookkeeping lives on Sui, but the file bytes are held by storage nodes off-chain. |
| "The user needs crypto to use this" | The user holds **0 SUI** and still gets an on-chain record — proven on testnet, see [03-gas-fees.md](03-gas-fees.md). |
