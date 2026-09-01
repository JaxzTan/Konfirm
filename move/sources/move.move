module konfirm::verdict;

use std::string::String;
use sui::event;

public struct AttesterCap has key, store { id: UID }

public struct Challenge has store, drop {
    challenger: address,
    reason_blob: String,
    at_ms: u64,
}

public struct Verdict has key {
    id: UID,
    claim_hash: vector<u8>,      // 去重 / 查重用
    claim_text: String,
    score: u8,                   // 0-100 中位数聚合结果
    state: u8,                   // 0=verified 1=disputed 2=unverifiable
    lang: String,                // en / ms / zh
    trace_blob: String,          // Walrus blobId
    submitted_by: address,       // zkLogin 用户地址（可为 attester 自己）
    attester: address,
    created_at_ms: u64,
    challenges: vector<Challenge>,
}

public struct VerdictCreated has copy, drop {
    verdict_id: ID,
    claim_hash: vector<u8>,
    score: u8,
    state: u8,
}

fun init(ctx: &mut TxContext) {
    transfer::transfer(
        AttesterCap { id: object::new(ctx) },
        ctx.sender()
    );
}

public fun submit_verdict(
    _: &AttesterCap,
    claim_hash: vector<u8>,
    claim_text: String,
    score: u8,
    state: u8,
    lang: String,
    trace_blob: String,
    submitted_by: address,
    clock: &sui::clock::Clock,
    ctx: &mut TxContext,
) { /* 构造 → emit → share_object */ }

public fun add_challenge(
    verdict: &mut Verdict,
    reason_blob: String,
    clock: &sui::clock::Clock,
    ctx: &mut TxContext,
) { /* append-only，任何人可调，无 cap */ }
