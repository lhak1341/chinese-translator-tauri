import { describe, it, expect } from 'vitest';
import {
  markPhraseFollowersConsumed,
  type ConsumableToken,
} from '../pattern/PhraseConsumptionMarker';

function makeToken(): ConsumableToken {
  return { translated: 'x' };
}

describe('markPhraseFollowersConsumed', () => {
  it('marks each follower as consumed and points it back at the leader', () => {
    const tokens = [makeToken(), makeToken(), makeToken()];
    markPhraseFollowersConsumed(tokens, 0, 3);

    expect(tokens[1].isGrouped).toBe(true);
    expect(tokens[1].groupLeader).toBe(0);
    expect(tokens[1].translated).toBeNull();
    expect(tokens[1].translationSource).toBe('phrases_consumed');

    expect(tokens[2].isGrouped).toBe(true);
    expect(tokens[2].groupLeader).toBe(0);
    expect(tokens[2].translated).toBeNull();
    expect(tokens[2].translationSource).toBe('phrases_consumed');
  });

  it('records every follower index on the leader groupedWith list', () => {
    const tokens = [makeToken(), makeToken(), makeToken()];
    markPhraseFollowersConsumed(tokens, 0, 3);
    expect(tokens[0].groupedWith).toEqual([1, 2]);
  });

  it('leaves the leader token itself untouched', () => {
    const tokens = [makeToken(), makeToken()];
    markPhraseFollowersConsumed(tokens, 0, 2);
    expect(tokens[0].isGrouped).toBeUndefined();
    expect(tokens[0].translated).toBe('x');
  });

  it('does not write past the end of the tokens array', () => {
    const tokens = [makeToken(), makeToken()];
    expect(() => markPhraseFollowersConsumed(tokens, 0, 5)).not.toThrow();
    expect(tokens[1].isGrouped).toBe(true);
  });

  it('appends to an existing groupedWith list rather than overwriting it', () => {
    const tokens = [makeToken(), makeToken(), makeToken(), makeToken()];
    tokens[0].groupedWith = [99];
    markPhraseFollowersConsumed(tokens, 0, 2);
    expect(tokens[0].groupedWith).toEqual([99, 1]);
  });

  it('is a no-op for a single-token span (tokenSpan 1)', () => {
    const tokens = [makeToken(), makeToken()];
    markPhraseFollowersConsumed(tokens, 0, 1);
    expect(tokens[1].isGrouped).toBeUndefined();
  });
});
