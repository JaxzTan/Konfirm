// Lists every Walrus blob this wallet has attested, newest first, then keeps
// watching and prints each new one as it lands on chain.
// Run from next/ (needs @mysten/sui):  node scripts/my-blobs.cjs [sui-address]
// With no address, SUI_WALLET from next/.env is used.
//   --once            print the backlog and exit (the old behaviour)
//   --interval=<sec>  how often to re-check while watching (default 15)
const fs = require('fs');
const path = require('path');
const { SuiGrpcClient } = require('@mysten/sui/grpc');
const { bcs } = require('@mysten/sui/bcs');

/**
 * Reads next/.env into process.env.
 *
 * This script runs under plain node, not Next, so nothing has loaded the env
 * file for us. Real environment variables win over the file, which is what
 * lets `SUI_WALLET=0x… node scripts/my-blobs.cjs` override it for one run.
 */
function loadEnv() {
  const file = path.join(__dirname, '..', '.env');
  let text;
  try {
    text = fs.readFileSync(file, 'utf8');
  } catch {
    return;   // no .env is fine — the argument and the real environment remain
  }
  for (const line of text.split('\n')) {
    const m = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$/);
    if (!m) continue;
    const key = m[1];
    // .env values here are unquoted, but tolerate quotes and the stray
    // trailing space that a hand-edited file tends to collect.
    const value = m[2].trim().replace(/^(['"])(.*)\1$/, '$2');
    if (process.env[key] === undefined) process.env[key] = value;
  }
}
loadEnv();

const PKG = process.env.NEXT_PUBLIC_PACKAGE_ID
  || '0x9c2a668463843b5838f8ad6490fb8c87299094563ba52daa53ed7754342a7344';
const RPC = process.env.NEXT_PUBLIC_SUI_RPC || 'https://fullnode.testnet.sui.io:443';
const AGG = process.env.NEXT_PUBLIC_WALRUS_AGGREGATOR
  || 'https://aggregator.walrus-testnet.walrus.space';

const args = process.argv.slice(2);
const addr = args.find((a) => !a.startsWith('--')) || process.env.SUI_WALLET;
const once = args.includes('--once');
const interval = Number(args.find((a) => a.startsWith('--interval='))?.split('=')[1] ?? 15);

if (!/^0x[0-9a-fA-F]{64}$/.test(addr || '')) {
  console.error('usage: node scripts/my-blobs.cjs [0x-64-hex-address] [--once] [--interval=15]');
  console.error('       with no address, SUI_WALLET from next/.env is used');
  if (process.env.SUI_WALLET) console.error(`       SUI_WALLET is set but not a 32-byte hex address: ${process.env.SUI_WALLET}`);
  process.exit(1);
}
if (!Number.isFinite(interval) || interval < 1) {
  console.error('--interval must be a number of seconds, at least 1');
  process.exit(1);
}

const Verdict = bcs.struct('Verdict', {
  id: bcs.Address, claimHash: bcs.byteVector(), lang: bcs.u8(), state: bcs.u8(), score: bcs.u8(),
  spreadLo: bcs.u8(), spreadHi: bcs.u8(), confidence: bcs.u8(), modelCount: bcs.u8(),
  models: bcs.vector(bcs.string()), requestIds: bcs.vector(bcs.string()), traceBlob: bcs.string(),
  challengeCount: bcs.u64(), createdAtMs: bcs.u64(), attester: bcs.Address,
});

const c = new SuiGrpcClient({ network: 'testnet', baseUrl: RPC });

// literals inside one term are ANDed: "emitted by registry" AND "sent by addr"
async function listVerdictIds() {
  const call = c.ledgerService.listEvents({
    filter: { terms: [{ literals: [
      { negated: false, predicate: { oneofKind: 'emitModule', emitModule: { module: `${PKG}::registry` } } },
      { negated: false, predicate: { oneofKind: 'sender', sender: { address: addr } } },
    ] }] },
    options: { limit: 50, ordering: 1 },   // 1 = DESCENDING (newest first)
    readMask: { paths: ['event_type', 'json', 'checkpoint', 'transaction_digest'] },
  });

  const ids = [];
  for await (const f of call.responses) {
    if (f.end) break;
    const e = f.event;
    if (!e || !e.eventType.endsWith('::VerdictCreated')) continue;
    ids.push({
      verdictId: e.json.kind.structValue.fields.verdict_id.kind.stringValue,
      tx: e.transactionDigest,
    });
  }
  return ids;
}

async function print({ verdictId, tx }) {
  const { object } = await c.core.getObject({ objectId: verdictId, include: { content: true } });
  const v = Verdict.parse(object.content);
  console.log(`${new Date(Number(v.createdAtMs)).toISOString()}  ${v.traceBlob}`);
  console.log(`    verdict ${verdictId}`);
  console.log(`    tx      ${tx}`);
  console.log(`    read    curl -s ${AGG}/v1/blobs/${v.traceBlob} | jq .`);
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

(async () => {
  const seen = new Set();

  const backlog = await listVerdictIds();
  if (!backlog.length) console.log(`no verdicts attested by ${addr}`);
  // Oldest first on the initial dump so the newest ends up nearest the prompt,
  // where the watch output will continue.
  for (const item of [...backlog].reverse()) {
    seen.add(item.verdictId);
    await print(item);
  }
  if (backlog.length) console.log(`\n${backlog.length} blob(s).`);

  if (once) return;

  console.log(`\nwatching ${addr} — new blobs appear below (ctrl-c to stop)`);
  for (;;) {
    await sleep(interval * 1000);
    let current;
    try {
      current = await listVerdictIds();
    } catch (e) {
      // A dropped connection or a node hiccup must not end a watch that may
      // run for hours — say so and try again on the next tick.
      console.error(`  (retrying: ${e.code ?? ''} ${decodeURIComponent(e.message ?? String(e))})`);
      continue;
    }
    for (const item of [...current].reverse()) {
      if (seen.has(item.verdictId)) continue;
      seen.add(item.verdictId);
      try {
        await print(item);
      } catch (e) {
        // The event proves the verdict exists; the object read can still fail.
        console.error(`  (could not read ${item.verdictId}: ${e.message ?? e})`);
      }
    }
  }
})().catch((e) => console.error('ERR', e.code ?? '', decodeURIComponent(e.message)));
