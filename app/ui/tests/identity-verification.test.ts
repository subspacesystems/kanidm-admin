// Unit tests for the identity-verification state machine, wire mapping and
// code helpers (src/features/identity/identity-verification.ts).

import { describe, expect, test } from 'bun:test';
import {
  getMsLeftFromNow,
  initialState,
  isValidCode,
  parseCode,
  parseIdentifyResponse,
  startRequestBody,
  submitCodeRequestBody,
  transition,
  type IdentifyResult,
  type IdentifyState,
} from '../src/features/identity/identity-verification.ts';

const provide = (totp = 123456, step = 300): IdentifyResult => ({
  kind: 'provideCode',
  step,
  totp,
});
const wait: IdentifyResult = { kind: 'waitForCode' };

describe('wire format', () => {
  test('request bodies are serde externally tagged', () => {
    expect(JSON.parse(startRequestBody())).toBe('Start');
    expect(JSON.parse(submitCodeRequestBody(12345))).toEqual({
      SubmitCode: { other_totp: 12345 },
    });
  });

  test('unit responses are plain strings', () => {
    const cases: [string, IdentifyResult['kind']][] = [
      ['IdentityVerificationUnavailable', 'unavailable'],
      ['IdentityVerificationAvailable', 'available'],
      ['WaitForCode', 'waitForCode'],
      ['CodeFailure', 'codeFailure'],
      ['Success', 'success'],
    ];
    for (const [wire, kind] of cases) {
      expect(parseIdentifyResponse(wire)).toEqual({ kind });
    }
  });

  test('ProvideCode carries step and totp', () => {
    expect(
      parseIdentifyResponse({ ProvideCode: { step: 300, totp: 654321 } })
    ).toEqual({ kind: 'provideCode', step: 300, totp: 654321 });
  });

  test('unknown shapes throw', () => {
    expect(() => parseIdentifyResponse('Nope')).toThrow();
    expect(() => parseIdentifyResponse(null)).toThrow();
    expect(() => parseIdentifyResponse({ ProvideCode: {} })).toThrow();
    expect(() => parseIdentifyResponse({ Other: 1 })).toThrow();
  });
});

describe('code helpers', () => {
  test('accepts 5 or 6 digits only', () => {
    expect(isValidCode('12345')).toBe(true);
    expect(isValidCode('123456')).toBe(true);
    expect(isValidCode('1234')).toBe(false);
    expect(isValidCode('1234567')).toBe(false);
    expect(isValidCode('12a45')).toBe(false);
    expect(isValidCode(' 12345')).toBe(false);
    expect(isValidCode('12345\n')).toBe(false);
    expect(isValidCode('')).toBe(false);
  });

  test('parseCode returns the number or null', () => {
    expect(parseCode('012345')).toBe(12345);
    expect(parseCode('654321')).toBe(654321);
    expect(parseCode('abc')).toBeNull();
    expect(parseCode('1234')).toBeNull();
  });

  test('getMsLeftFromNow counts to the end of the step window', () => {
    expect(getMsLeftFromNow(300, 0)).toBe(300_000);
    expect(getMsLeftFromNow(300, 1_000)).toBe(299_000);
    expect(getMsLeftFromNow(300, 299_999)).toBe(1);
    expect(getMsLeftFromNow(300, 300_000)).toBe(300_000);
    expect(getMsLeftFromNow(300, 1_700_000_123_456)).toBe(
      300_000 - (1_700_000_123_456 % 300_000)
    );
  });

  test('getMsLeftFromNow defaults to the current time', () => {
    const left = getMsLeftFromNow(300);
    expect(left).toBeGreaterThan(0);
    expect(left).toBeLessThanOrEqual(300_000);
  });
});

describe('state machine', () => {
  const idDisplay: IdentifyState = { kind: 'idDisplayAndSubmit' };
  const submit: IdentifyState = { kind: 'submitCode', otherId: 'bob@x' };
  const first: IdentifyState = {
    kind: 'displayCodeFirst',
    otherId: 'bob@x',
    selfTotp: 111111,
    step: 300,
  };
  const second: IdentifyState = {
    kind: 'displayCodeSecond',
    otherId: 'bob@x',
    selfTotp: 222222,
    step: 300,
  };

  test('starts in start', () => {
    expect(initialState()).toEqual({ kind: 'start' });
  });

  test('start: available moves on, unavailable ends, others are invalid', () => {
    const s = initialState();
    expect(transition(s, { type: 'started', result: { kind: 'available' } })).toEqual(
      idDisplay
    );
    expect(
      transition(s, { type: 'started', result: { kind: 'unavailable' } })
    ).toEqual({ kind: 'unavailable' });
    for (const result of [wait, provide(), { kind: 'codeFailure' }, { kind: 'success' }] as IdentifyResult[]) {
      expect(transition(s, { type: 'started', result })).toEqual({
        kind: 'failed',
        reason: 'invalidState',
      });
    }
  });

  test('idDisplayAndSubmit: WaitForCode goes to submitCode with the other id', () => {
    expect(
      transition(idDisplay, { type: 'otherIdSubmitted', otherId: 'bob@x', result: wait })
    ).toEqual(submit);
  });

  test('idDisplayAndSubmit: ProvideCode goes to displayCodeFirst', () => {
    expect(
      transition(idDisplay, {
        type: 'otherIdSubmitted',
        otherId: 'bob@x',
        result: provide(111111),
      })
    ).toEqual(first);
  });

  test('idDisplayAndSubmit: anything else is invalid', () => {
    for (const result of [
      { kind: 'unavailable' },
      { kind: 'available' },
      { kind: 'codeFailure' },
      { kind: 'success' },
    ] as IdentifyResult[]) {
      expect(
        transition(idDisplay, { type: 'otherIdSubmitted', otherId: 'bob@x', result })
      ).toEqual({ kind: 'failed', reason: 'invalidState' });
    }
  });

  test('submitCode: CodeFailure fails with reason code', () => {
    expect(
      transition(submit, { type: 'codeSubmitted', result: { kind: 'codeFailure' } })
    ).toEqual({ kind: 'failed', reason: 'code' });
  });

  test('submitCode: Success ends with the other id', () => {
    expect(
      transition(submit, { type: 'codeSubmitted', result: { kind: 'success' } })
    ).toEqual({ kind: 'success', otherId: 'bob@x' });
  });

  test('submitCode: ProvideCode goes to displayCodeSecond', () => {
    expect(
      transition(submit, { type: 'codeSubmitted', result: provide(222222) })
    ).toEqual(second);
  });

  test('submitCode: anything else is invalid', () => {
    for (const result of [
      wait,
      { kind: 'unavailable' },
      { kind: 'available' },
    ] as IdentifyResult[]) {
      expect(transition(submit, { type: 'codeSubmitted', result })).toEqual({
        kind: 'failed',
        reason: 'invalidState',
      });
    }
  });

  test('displayCodeFirst: confirmed goes back to submitCode, kept id', () => {
    expect(transition(first, { type: 'confirmed' })).toEqual(submit);
  });

  test('displayCodeSecond: confirmed ends in success', () => {
    expect(transition(second, { type: 'confirmed' })).toEqual({
      kind: 'success',
      otherId: 'bob@x',
    });
  });

  test('declined fails in both display states', () => {
    for (const s of [first, second]) {
      expect(transition(s, { type: 'declined' })).toEqual({
        kind: 'failed',
        reason: 'declined',
      });
    }
  });

  test('an event that does not fit the state is invalid', () => {
    expect(transition(initialState(), { type: 'confirmed' })).toEqual({
      kind: 'failed',
      reason: 'invalidState',
    });
    expect(
      transition(submit, { type: 'started', result: { kind: 'available' } })
    ).toEqual({ kind: 'failed', reason: 'invalidState' });
    expect(transition(idDisplay, { type: 'confirmed' })).toEqual({
      kind: 'failed',
      reason: 'invalidState',
    });
    expect(
      transition(first, { type: 'codeSubmitted', result: { kind: 'success' } })
    ).toEqual({ kind: 'failed', reason: 'invalidState' });
  });

  test('terminal states stay as they are', () => {
    const terminals: IdentifyState[] = [
      { kind: 'unavailable' },
      { kind: 'success', otherId: 'bob@x' },
      { kind: 'failed', reason: 'code' },
    ];
    for (const t of terminals) {
      expect(transition(t, { type: 'confirmed' })).toEqual(t);
      expect(transition(t, { type: 'declined' })).toEqual(t);
    }
  });

  test('the full CLI paths', () => {
    // Lower id waits first: start, other id -> wait, code -> provide, confirm.
    let s = initialState();
    s = transition(s, { type: 'started', result: { kind: 'available' } });
    s = transition(s, { type: 'otherIdSubmitted', otherId: 'bob@x', result: wait });
    s = transition(s, { type: 'codeSubmitted', result: provide(222222) });
    s = transition(s, { type: 'confirmed' });
    expect(s).toEqual({ kind: 'success', otherId: 'bob@x' });

    // Higher id shows its code first, then submits the other's.
    s = initialState();
    s = transition(s, { type: 'started', result: { kind: 'available' } });
    s = transition(s, {
      type: 'otherIdSubmitted',
      otherId: 'bob@x',
      result: provide(111111),
    });
    s = transition(s, { type: 'confirmed' });
    s = transition(s, { type: 'codeSubmitted', result: { kind: 'success' } });
    expect(s).toEqual({ kind: 'success', otherId: 'bob@x' });
  });
});
