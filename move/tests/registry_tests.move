#[test_only]
module konfirm::registry_tests;

use std::string;
use sui::clock;
use sui::test_scenario as ts;
use konfirm::registry::{Self, Verdict};

const ATTESTER: address = @0xA11CE;
const CHALLENGER: address = @0xB0B;

#[test]
fun create_verdict_sets_expected_fields_and_starts_unchallenged() {
    let mut scenario = ts::begin(ATTESTER);
    {
        let clock = clock::create_for_testing(scenario.ctx());
        registry::create_verdict(
            b"claimhash32bytes................",
            0, // lang: en
            registry::state_verdict(),
            72,
            65,
            80,
            0, // confidence: high
            3,
            vector[string::utf8(b"deepseek-v3"), string::utf8(b"kimi"), string::utf8(b"minimax")],
            vector[string::utf8(b"gnk_1"), string::utf8(b"gnk_2"), string::utf8(b"gnk_3")],
            string::utf8(b"walrus-blob-id"),
            &clock,
            scenario.ctx(),
        );
        clock.destroy_for_testing();
    };

    scenario.next_tx(ATTESTER);
    {
        let verdict = scenario.take_shared<Verdict>();
        assert!(verdict.score() == 72, 0);
        assert!(verdict.state() == registry::state_verdict(), 1);
        assert!(verdict.challenge_count() == 0, 2);
        assert!(verdict.attester() == ATTESTER, 3);
        ts::return_shared(verdict);
    };

    scenario.end();
}

#[test]
fun challenge_increments_count_and_leaves_verdict_fields_untouched() {
    let mut scenario = ts::begin(ATTESTER);
    {
        let clock = clock::create_for_testing(scenario.ctx());
        registry::create_verdict(
            b"claimhash32bytes................",
            2, // lang: zh
            registry::state_disputed(),
            registry::no_score(),
            10,
            90,
            1,
            3,
            vector[],
            vector[],
            string::utf8(b"walrus-blob-id"),
            &clock,
            scenario.ctx(),
        );
        clock.destroy_for_testing();
    };

    scenario.next_tx(CHALLENGER);
    {
        let mut verdict = scenario.take_shared<Verdict>();
        let clock = clock::create_for_testing(scenario.ctx());

        registry::challenge(
            &mut verdict,
            string::utf8(b"here's evidence this is wrong"),
            &clock,
            scenario.ctx(),
        );

        assert!(verdict.challenge_count() == 1, 0);
        assert!(verdict.score() == registry::no_score(), 1);

        clock.destroy_for_testing();
        ts::return_shared(verdict);
    };

    scenario.next_tx(CHALLENGER);
    {
        let challenge = scenario.take_shared<registry::Challenge>();
        assert!(challenge.challenger() == CHALLENGER, 2);
        ts::return_shared(challenge);
    };

    scenario.end();
}
