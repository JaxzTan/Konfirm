import { describe, expect, it } from 'vitest';
import { redactDeep, redactPii } from './redact';

// TR-10's whole point is that these never reach Walrus, which is public and
// which we cannot delete from (docs/plan_v1.md §2 B1). Each case is a shape a
// Malaysian user actually pastes into the claim box.
describe('redactPii', () => {
  it.each([
    ['IC', 'my ic is 990101-14-1234 ok', '[redacted-ic]'],
    ['intl phone, spaced', 'call +60 12-345 6789 now', '[redacted-phone]'],
    ['intl phone, bare', 'call 60123456789 now', '[redacted-phone]'],
    ['local phone', 'call 012-345 6789 now', '[redacted-phone]'],
    ['email', 'mail me at ali.bin+news@example.com.my', '[redacted-email]'],
    ['whatsapp link', 'join https://wa.me/60123456789 today', '[redacted-link]'],
  ])('redacts %s', (_label, input, tag) => {
    const output = redactPii(input);
    expect(output).toContain(tag);
    expect(output).not.toMatch(/\d{6}-\d{2}-\d{4}|60\d{8,9}|@example/);
  });

  it('leaves ordinary numbers alone', () => {
    expect(redactPii('the claim scored 87 out of 100 in 2026')).toBe(
      'the claim scored 87 out of 100 in 2026',
    );
  });

  it('does not let the phone patterns eat an IC', () => {
    // The IC pattern has to win: 990101-14-1234 contains digit runs that a
    // loose phone regex would happily claim part of.
    expect(redactPii('990101-14-1234')).toBe('[redacted-ic]');
  });
});

describe('redactDeep', () => {
  it('redacts string leaves at any depth without changing shape', () => {
    const input = {
      state: 'false',
      models: [{ name: 'DeepSeek', reasoning: 'the poster left 012-345 6789' }],
      score: 18,
      nested: { deeper: ['contact me@x.my'] },
    };

    expect(redactDeep(input)).toEqual({
      state: 'false',
      models: [{ name: 'DeepSeek', reasoning: 'the poster left [redacted-phone]' }],
      score: 18,
      nested: { deeper: ['contact [redacted-email]'] },
    });
  });
});
