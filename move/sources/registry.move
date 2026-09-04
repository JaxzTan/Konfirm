/// Konfirm's on-chain trust layer (TRD §4.1). Two entry functions, no
/// update, no delete: `create_verdict` and `challenge`. The only field that
/// can ever change after creation is `challenge_count`, and it can only
/// increase — that's the entire definition of "append-only" for this
/// module.
///
/// STATE_* and NO_SCORE are only referenced from #[test_only] accessors
/// today — production create_verdict/challenge take raw u8 params and
/// trust the caller (see create_verdict's doc comment on why there's no
/// on-chain validation of them yet).
#[allow(unused_const)]
module konfirm::registry;

use std::string::String;
use sui::clock::Clock;
use sui::event;

/// `state` values on `Verdict`. Matches the aggregate() state machine
/// (TRD §5): median-based verdict, cross-model disagreement, majority
/// "can't verify", or too few models responded to say anything.
const STATE_VERDICT: u8 = 0;
const STATE_DISPUTED: u8 = 1;
const STATE_UNVERIFIABLE: u8 = 2;
const STATE_INSUFFICIENT: u8 = 3;

/// Sentinel for `score` when state is anything but STATE_VERDICT — the
/// aggregator explicitly withholds a score in those cases (FR-4), and a
/// bare 0 would be indistinguishable from a real "0% true" score.
const NO_SCORE: u8 = 255;

/// A single fact-check result, created once and never mutated except for
/// `challenge_count`. Shared so anyone — not just the creator — can read
/// it or attach a Challenge.
public struct Verdict has key {
    id: UID,
    /// sha256(normalize(text) || lang), 32 bytes. Never the raw claim text
    /// (NFR-4) — PDPA risk if the original forward contained a name/phone/IC.
    claim_hash: vector<u8>,
    /// 0 = en, 1 = ms, 2 = zh (TRD §4.1 enum, kept as u8 not String to
    /// match the reference schema exactly).
    lang: u8,
    state: u8,
    /// 0-100, or NO_SCORE when state != STATE_VERDICT.
    score: u8,
    spread_lo: u8,
    spread_hi: u8,
    /// 0 = high, 1 = medium, 2 = n/a.
    confidence: u8,
    model_count: u8,
    models: vector<String>,
    /// Gonka Request IDs — the judge-facing proof that inference actually
    /// ran on GonkaRouter (FR-6 acceptance criteria).
    request_ids: vector<String>,
    /// Walrus blob ID holding the full (PII-redacted) reasoning trace.
    trace_blob: String,
    /// The only mutable field. Only ever incremented by `challenge`.
    challenge_count: u64,
    created_at_ms: u64,
    attester: address,
}

/// A public, permanent objection to a `Verdict`. Separate shared object
/// (not a field inside Verdict) so each challenge gets its own object ID —
/// P3 needs to link directly to their own challenge on the explorer, and
/// nothing here can ever delete or edit one once it exists.
public struct Challenge has key {
    id: UID,
    verdict_id: ID,
    evidence_blob: String,
    challenger: address,
    created_at_ms: u64,
}

public struct VerdictCreated has copy, drop {
    verdict_id: ID,
    claim_hash: vector<u8>,
}

public struct Challenged has copy, drop {
    verdict_id: ID,
    challenge_id: ID,
}

/// Creates a `Verdict` and shares it. Callable by anyone with no
/// capability gate — TRD §4.1 specifies exactly two entry functions and
/// does not call for access control here. In practice the caller is
/// whichever zkLogin account signs the sponsored transaction from
/// `/api/attest`, so the actual gate today is "you went through the
/// verdict flow in the app," not an on-chain check. If that turns out to
/// be too weak (a malicious client could call this directly with a
/// fabricated score), that's a real design question to raise with the
/// team before mainnet — NOT something to silently decide in this file.
public fun create_verdict(
    claim_hash: vector<u8>,
    lang: u8,
    state: u8,
    score: u8,
    spread_lo: u8,
    spread_hi: u8,
    confidence: u8,
    model_count: u8,
    models: vector<String>,
    request_ids: vector<String>,
    trace_blob: String,
    clock: &Clock,
    ctx: &mut TxContext,
) {
    let verdict = Verdict {
        id: object::new(ctx),
        claim_hash,
        lang,
        state,
        score,
        spread_lo,
        spread_hi,
        confidence,
        model_count,
        models,
        request_ids,
        trace_blob,
        challenge_count: 0,
        created_at_ms: clock.timestamp_ms(),
        attester: ctx.sender(),
    };

    event::emit(VerdictCreated {
        verdict_id: object::id(&verdict),
        claim_hash: verdict.claim_hash,
    });

    transfer::share_object(verdict);
}

/// Appends a public objection. No capability required — FR-13 explicitly
/// wants any wallet address to be able to challenge, self-paid, no
/// zkLogin, no sponsorship. Mutates exactly one field on `Verdict`
/// (`challenge_count`, +1 only) and otherwise only ever creates new state,
/// never touches old state.
public fun challenge(
    verdict: &mut Verdict,
    evidence_blob: String,
    clock: &Clock,
    ctx: &mut TxContext,
) {
    let challenge = Challenge {
        id: object::new(ctx),
        verdict_id: object::id(verdict),
        evidence_blob,
        challenger: ctx.sender(),
        created_at_ms: clock.timestamp_ms(),
    };

    verdict.challenge_count = verdict.challenge_count + 1;

    event::emit(Challenged {
        verdict_id: object::id(verdict),
        challenge_id: object::id(&challenge),
    });

    transfer::share_object(challenge);
}

#[test_only]
public fun state_verdict(): u8 { STATE_VERDICT }
#[test_only]
public fun state_disputed(): u8 { STATE_DISPUTED }
#[test_only]
public fun state_unverifiable(): u8 { STATE_UNVERIFIABLE }
#[test_only]
public fun state_insufficient(): u8 { STATE_INSUFFICIENT }
#[test_only]
public fun no_score(): u8 { NO_SCORE }

#[test_only]
public fun score(verdict: &Verdict): u8 { verdict.score }
#[test_only]
public fun state(verdict: &Verdict): u8 { verdict.state }
#[test_only]
public fun challenge_count(verdict: &Verdict): u64 { verdict.challenge_count }
#[test_only]
public fun attester(verdict: &Verdict): address { verdict.attester }
#[test_only]
public fun challenger(challenge: &Challenge): address { challenge.challenger }
