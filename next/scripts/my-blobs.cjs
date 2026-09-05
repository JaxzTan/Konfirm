// Lists every Walrus blob this wallet has attested, newest first.
// Run from next/ (needs @mysten/sui):  node myblobs.cjs <sui-address>
const { SuiGrpcClient } = require('@mysten/sui/grpc');
const { bcs } = require('@mysten/sui/bcs');

const PKG = process.env.NEXT_PUBLIC_PACKAGE_ID
  || '0x9c2a668463843b5838f8ad6490fb8c87299094563ba52daa53ed7754342a7344';
const RPC = process.env.NEXT_PUBLIC_SUI_RPC || 'https://fullnode.testnet.sui.io:443';
const AGG = process.env.NEXT_PUBLIC_WALRUS_AGGREGATOR
  || 'https://aggregator.walrus-testnet.walrus.space';

const addr = process.argv[2];
if (!/^0x[0-9a-fA-F]{64}$/.test(addr || '')) {
  console.error('usage: node myblobs.cjs <0x-64-hex-address>');
  process.exit(1);
}

const Verdict = bcs.struct('Verdict', {
  id: bcs.Address, claimHash: bcs.byteVector(), lang: bcs.u8(), state: bcs.u8(), score: bcs.u8(),
  spreadLo: bcs.u8(), spreadHi: bcs.u8(), confidence: bcs.u8(), modelCount: bcs.u8(),
  models: bcs.vector(bcs.string()), requestIds: bcs.vector(bcs.string()), traceBlob: bcs.string(),
  challengeCount: bcs.u64(), createdAtMs: bcs.u64(), attester: bcs.Address,
});

const c = new SuiGrpcClient({ network: 'testnet', baseUrl: RPC });

(async () => {
  // literals inside one term are ANDed: "emitted by registry" AND "sent by addr"
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

  if (!ids.length) return console.log(`no verdicts attested by ${addr}`);

  for (const { verdictId, tx } of ids) {
    const { object } = await c.core.getObject({ objectId: verdictId, include: { content: true } });
    const v = Verdict.parse(object.content);
    console.log(`${new Date(Number(v.createdAtMs)).toISOString()}  ${v.traceBlob}`);
    console.log(`    verdict ${verdictId}`);
    console.log(`    tx      ${tx}`);
    console.log(`    read    curl -s ${AGG}/v1/blobs/${v.traceBlob} | jq .`);
  }
  console.log(`\n${ids.length} blob(s).`);
})().catch((e) => console.error('ERR', e.code ?? '', decodeURIComponent(e.message)));
