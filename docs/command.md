# Konfirm — command cheat-sheet

Grouped by phase. `$PKG`, `$VERDICT_ID` etc. are placeholders — export them once you have real values.

---

## 0. Toolchain

```bash
# Sui CLI (pick one)
brew install sui
cargo install --locked --git https://github.com/MystenLabs/sui.git --branch testnet sui

sui --version
```

## 1. Sui testnet wallet + faucet

```bash
sui client new-env --alias testnet --rpc https://fullnode.testnet.sui.io:443
sui client switch --env testnet

sui client new-address ed25519          # creates address; save the recovery phrase
sui client active-address
sui client faucet                       # testnet SUI for gas
sui client gas                          # confirm balance
```

## 2. Move package — build / test / publish

```bash
cd move
sui move build
sui move test
sui client publish --gas-budget 100000000

# from the publish output, grab:
#   Published Objects → PackageID → NEXT_PUBLIC_PACKAGE_ID
# There is no capability object: registry.move has no Cap type, and
# create_verdict is ungated on purpose (see the comment above it).
export PKG=0x...
```

Inspect what got deployed:

```bash
sui client object $PKG
```

## 3. Smoke-test contract calls from CLI (before wiring frontend)

```bash
# create a verdict. Arg order matches create_verdict in
# move/sources/registry.move — 11 args, then the shared Clock at 0x6.
# vector<u8> takes a JSON array; vector<String> takes a JSON array of strings.
sui client call \
  --package $PKG --module registry --function create_verdict \
  --args '[1,2,3]' 0 0 72 60 85 90 3 \
         '["deepseek","kimi","qwen"]' '["req-1","req-2","req-3"]' \
         "<walrus_blob_id>" 0x6 \
  --gas-budget 10000000

# read it back
export VERDICT_ID=0x...
sui client object $VERDICT_ID --json

# append a challenge (no cap needed — proves any address can append,
# self-paid, which is exactly what FR-13 wants)
sui client call \
  --package $PKG --module registry --function challenge \
  --args $VERDICT_ID "<evidence_blob_id>" 0x6 \
  --gas-budget 10000000

# query emitted events for off-chain indexing
sui client events --package $PKG   # or via RPC: suix_queryEvents
```

## 4. Walrus — public HTTP publisher (no WAL token)

```bash
export WALRUS_PUB=https://publisher.walrus-testnet.walrus.space
export WALRUS_AGG=https://aggregator.walrus-testnet.walrus.space

# upload reasoning trace (PII-scrubbed JSON), keep 5 epochs
curl -X PUT "$WALRUS_PUB/v1/blobs?epochs=5" \
  -H "Content-Type: application/json" \
  --data-binary @trace.json
# → response contains newlyCreated.blobObject.blobId (or alreadyCertified.blobId on dedupe)

# read it back
curl "$WALRUS_AGG/v1/blobs/<blobId>"
```

## 5. Next.js frontend deps

```bash
npm i @mysten/dapp-kit @mysten/sui @mysten/enoki @tanstack/react-query
npm i -D @types/node

# env
cat >> .env.local <<'EOF'
NEXT_PUBLIC_SUI_NETWORK=testnet
NEXT_PUBLIC_PACKAGE_ID=0x...
NEXT_PUBLIC_ENOKI_API_KEY=enoki_public_...
NEXT_PUBLIC_GOOGLE_CLIENT_ID=....apps.googleusercontent.com
ATTESTER_PRIVATE_KEY=suiprivkey1...      # fallback / Option A only, server-side
GONKA_API_KEY=...
EOF

npm run dev
npm run build && npm run start          # verify clean build before merging
```

## 6. Fallback attester keypair (R-1 fallback / Option A)

```bash
sui client new-address ed25519 attester
sui client switch --address attester
sui client faucet
sui keytool export --key-identity attester    # → suiprivkey1... for ATTESTER_PRIVATE_KEY
```

## 7. Prisma (draftId score cache + verdict index)

```bash
npm i prisma @prisma/client
npx prisma init
npx prisma migrate dev --name init
npx prisma generate
npx prisma studio                       # browse cached drafts / indexed verdicts
```

## 8. Git workflow

```bash
git checkout dev && git pull
git checkout -b feature/enoki-merge

# merge the enoki branch, drop the stray file
git merge feature/enoki-setup
git rm "app/providers 2.tsx"
git commit -m "chore(frontend): remove duplicate providers file"

# feature → dev (squash), dev → main (merge commit)
git checkout dev && git merge --squash feature/enoki-merge && git commit -m "feat(auth): wire Enoki zkLogin provider tree"
git checkout main && git merge --no-ff dev
```

Commit format (enforced by commitlint + husky):

```
feat(move): add claim_hash dedup to submit_verdict
fix(api): cache scores to draftId before returning
docs(trd): resolve signing-path conflict
```

## 9. Pre-demo health checks

```bash
curl -s localhost:3000/api/health | jq          # Gonka balance + faucet balance
sui client gas                                   # attester still has gas?
curl -s "$WALRUS_AGG/v1/blobs/<known_blobId>" | head -c 200   # Walrus still serving?
sui client object $PKG >/dev/null && echo "package OK"
```

## 10. Useful lookups

```bash
# explorer
open "https://suiscan.xyz/testnet/object/$VERDICT_ID"

# RPC: get object by ID (what the /v/[objectId] page does)
curl -s https://fullnode.testnet.sui.io:443 -H 'Content-Type: application/json' -d '{
  "jsonrpc":"2.0","id":1,"method":"sui_getObject",
  "params":["'$VERDICT_ID'",{"showContent":true}]
}' | jq
```
