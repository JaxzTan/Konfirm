# 6. Q&A cheat sheet

Short answers first — one or two sentences you can say out loud — with the supporting detail
underneath. Everything here is traceable to code or docs in this repository.

---

## About zkLogin

**Q: What is zkLogin, in one sentence?**
A native Sui feature that derives a real blockchain address from a Google sign-in, using a
zero-knowledge proof, so the user needs no seed phrase and their Google identity is never
revealed on-chain.

**Q: So you're holding the user's keys for them? Isn't that custodial?**
No. The chain itself verifies a zkLogin signature — validators understand the format
natively. There is no intermediary signing on the user's behalf; the address genuinely
belongs to them.

**Q: What stops anyone with the user's email from taking their address?**
The address derivation requires a valid, freshly issued Google token bound to the session's
ephemeral key, plus the per-application salt. Knowing the email accomplishes nothing.

**Q: Can I see who signed a verdict by looking at the chain?**
No — that is the "zk" part. You see a `0x…` address. The Google account behind it is not
disclosed by the transaction.

**Q: Will the same person always get the same address?**
Yes, for the same Google account in the same Enoki application. It is a documented
requirement (FR-11). The salt is per-application, which is why our operational rules forbid
deleting and recreating the Enoki app.

**Q: What is Enoki, then — is that the blockchain?**
No. zkLogin is the Sui protocol feature; Enoki is Mysten Labs' managed service that provides
the three pieces you would otherwise build yourself — the salt service, the ZK prover, and
sponsored transactions. Roughly three days of work reduced to an API key.

**Q: Does the user know they are writing to a blockchain?**
Yes, and we had to build that ourselves. Unlike MetaMask, Enoki shows no approval popup — one
click signs. So there is an explicit confirm-before-sign screen; signing in is not treated as
consent to publish.

---

## About Walrus

**Q: What is Walrus?**
A decentralised blob-storage protocol from the Sui team. Large files are erasure-coded into
fragments spread across independent storage nodes, and the record of what is stored, and
until when, is kept on Sui.

**Q: Why not just store the reasoning on the blockchain?**
Because every validator stores every on-chain byte forever. A chain is built for small
structured records; AI reasoning traces are large text. Walrus is built for exactly that gap.

**Q: Why not your own database, or S3?**
Then we could edit it, and the whole product argument collapses. The point is that a sceptical
reader does not have to trust Konfirm.

**Q: How is Walrus cheaper than replicating to every node?**
Erasure coding. The file is split into slivers such that any sufficiently large subset
reconstructs the original, so no node holds the whole file. Replication overhead is roughly
4–5×, not 100×.

**Q: What is a blob ID?**
A content-derived identifier — a cryptographic commitment to the encoded content. Identical
bytes always yield the identical ID, which is why our upload code handles both `newlyCreated`
and `alreadyCertified` responses.

**Q: How does that stop you from swapping the reasoning afterwards?**
Changing one character changes the blob ID. The old ID sits in an immutable field of the
on-chain object, so a swapped trace no longer matches the record. Tampering is detectable by
anyone, without asking us.

**Q: Is the reasoning readable by anybody?**
Yes — Walrus blobs are public by default, which is what we want for a verification record. It
is also why PII redaction happens *before* upload: Malaysian phone numbers, IC numbers and
email addresses are stripped from every string in the document.

**Q: Does Walrus storage last forever?**
No — storage is rented per epoch and can be extended. On testnet we currently take the public
publisher's default, and one of our four live verdicts has already lost its trace. The page
degrades correctly to the on-chain evidence, and the fix is to request more epochs on upload,
or run our own publisher in production.

---

## About gas and money — the leader's question

**Q: zkLogin connects a wallet, which writes to Sui and Walrus. Who pays the gas?**
Three separate payments. **Walrus storage** is paid in WAL by whoever runs the publisher —
that call happens on our server. **Sui gas** for creating the verdict is paid by our Enoki
sponsor pool. **The user pays nothing and holds no tokens.** The only self-paid transaction in
the system is a `Challenge`, and that is deliberate.

**Q: Prove the user isn't paying.**
Two facts have to hold together: the sender's balance is 0 SUI, and the gas payer on the
transaction is a different address. Three verdicts on testnet show exactly that, all paid by
the same sponsor address. Open any one on Suiscan and look at the gas payer field.

**Q: How does sponsorship work technically?**
A Sui transaction separates *what to do* from *how gas is paid*. The browser builds only the
first part — a "transaction kind" — with no coins. Our server asks Enoki to wrap it with the
sponsor's gas. The user's wallet signs those bytes, and the sponsor co-signs as gas owner.

**Q: Why do you need a backend for that? Isn't it an allowlist setting?**
That was our initial assumption and it is wrong. Sponsorship requires Enoki's **private** API
key, which cannot ship to a browser, and the wallet's own sign methods build gas against the
user's own zero-balance address. The correction is documented in `lib/enoki/sponsor.ts`.

**Q: What stops someone draining your sponsor pool?**
Four layers. The allowlist contains exactly one function, `registry::create_verdict`. The
sponsored bytes are pinned to a single sender address, so a leaked response cannot be
replayed. `/api/attest` and `/api/sponsor` are rate-limited to 3 requests per minute per IP.
And the private key never leaves the server.

**Q: Why isn't the challenge sponsored too?**
By design. A free objection endpoint would be spammable, and paying for objections against
our own records would be nonsense. The challenger is an organisation that already has a
wallet, and paying their own gas is what makes the dissent independently theirs.

**Q: What does this cost at scale?**
The operator costs are Walrus storage in WAL, Sui gas in SUI, and AI inference credits. Sui
gas is small per transaction. Walrus is the variable one, and it is bounded by the trace size
and the storage period we choose — both under our control.

**Q: Does reading cost anything?**
No. Reads from a Sui fullnode and from a Walrus aggregator are free, which is why the
verification page has no login wall.

---

## About the data

**Q: What exactly goes on-chain?**
The claim's hash, language, verdict state, score and spread, confidence, model names, Gonka
Request IDs, the Walrus blob ID, a challenge counter, the timestamp, and the attester's
address. Not the message text.

**Q: Why only the hash?**
On-chain data is permanent and undeletable. Forwarded messages routinely contain names, phone
numbers and IC numbers, and PDPA 2010 applies. Publishing that with no possibility of removal
is a risk we refuse to take. The hash is computed in the browser, so our server never sees
the text either.

**Q: If you only store a hash, what use is it?**
Anyone holding the original message can recompute the hash and confirm it matches the record —
proving that this exact message produced this exact verdict. What they cannot do is browse
the chain and read other people's messages.

**Q: Can Konfirm edit or delete a verdict?**
No. The Move module exposes two entry functions, `create_verdict` and `challenge`. There is
no update and no delete. The only mutable field is `challenge_count`, which can only
increase. That is verifiable by reading the published module.

---

## Sharing

**Q: How does a user share a result?**
The Sui object ID *is* the permalink — no link shortener, no share database. The result screen
offers `/v/{objectId}`, the full verification page, and `/card/{objectId}`, a card built to be
screenshotted into a group chat. The share button uses the native share sheet, so on a phone
it goes straight to WhatsApp.

**Q: What does the recipient need?**
Nothing. No wallet, no login, no app. It is a public server-rendered page — a requirement
(FR-10), not an oversight.

**Q: And if the recipient doesn't trust Konfirm's website either?**
Then they bypass us entirely: read the object on Suiscan, fetch the blob from any Walrus
aggregator, and check the Gonka Request IDs to retrace the inference. Every step is verifiable
without our servers being in the path.

---

## The hostile questions

**Q: Blockchain doesn't make the AI correct. Isn't this security theatre?**
Correct, and we say so in the product itself. On-chain proves the record was not edited after
the fact — nothing more. It is *not* a claim of truth. That is precisely why the contract
supports permanent public challenges, and why we show disagreement instead of hiding it
behind a confident number.

**Q: What if the models are wrong or split?**
Below two significant verdicts we refuse to produce a score at all and return
`CANNOT_BE_VERIFIED` with a null score. When models split, both positions are shown. The
aggregator is deliberately built to decline rather than to invent confidence.

**Q: Could someone call your contract directly and write a fake verdict?**
Yes, today. `create_verdict` has no capability gate — the TRD specified two entry functions
and no access control, and the module's own doc comment flags this as a real pre-mainnet
design question rather than something to decide silently. `/api/attest` also does not yet
verify the zkLogin JWT. Both are known and written down, not discovered on stage.

**Q: What was hard?**
Two things. First, the documented Enoki sponsorship behaviour did not match the SDK — we had
to discover that the wallet builds gas against a zero-balance address, and rebuild the signing
path as a three-leg server flow. Second, public Sui JSON-RPC endpoints were retired, and
dapp-kit had not shipped a fix, so we moved every network call onto a gRPC client and decode
the object with BCS ourselves.
