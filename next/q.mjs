import { SuiGrpcClient } from '@mysten/sui/grpc';
const c = new SuiGrpcClient({ network: 'testnet', baseUrl: 'https://fullnode.testnet.sui.io:443' });
const PKG = '0x9c2a668463843b5838f8ad6490fb8c87299094563ba52daa53ed7754342a7344';
const ADDR = '0x33a9868f78f9022c84cf3a796146a3f0fcc7e6a88758b7051aca416d98f10c96';
const wanted = `${PKG}::registry::VerdictCreated`;
const page = await c.core.listEvents({ filter: { sender: ADDR }, limit: 50 });
const evs = (page.events ?? []).filter(e => e.eventType === wanted);
for (const e of evs) console.log(e.json.verdict_id, e.transactionDigest);
