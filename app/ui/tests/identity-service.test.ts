// Unit tests for IdentityService: the requests it sends and how it maps
// answers (fetch is replaced; nothing leaves the process).

import { afterEach, describe, expect, test } from 'bun:test';
import { identityService } from '../src/features/identity/services/identity.service.ts';

const realFetch = globalThis.fetch;
afterEach(() => {
  globalThis.fetch = realFetch;
});

interface Seen {
  url: string;
  method: string;
  body: unknown;
}

function mockFetch(answer: unknown, status = 200): Seen[] {
  const seen: Seen[] = [];
  globalThis.fetch = (async (url: string, init?: RequestInit) => {
    seen.push({
      url: String(url),
      method: init?.method ?? 'GET',
      body: init?.body ? JSON.parse(String(init.body)) : undefined,
    });
    return new Response(JSON.stringify(answer), {
      status,
      headers: { 'Content-Type': 'application/json' },
    });
  }) as unknown as typeof fetch;
  return seen;
}

describe('IdentityService', () => {
  test('start posts "Start" to the person and maps the answer', async () => {
    const seen = mockFetch('WaitForCode');
    const result = await identityService.start('bob@example.com');
    expect(result).toEqual({ kind: 'waitForCode' });
    expect(seen).toHaveLength(1);
    expect(seen[0].method).toBe('POST');
    expect(seen[0].url).toBe(
      '/api/kanidm/v1/person/bob%40example.com/_identify_user'
    );
    expect(seen[0].body).toBe('Start');
  });

  test('start maps ProvideCode', async () => {
    mockFetch({ ProvideCode: { step: 300, totp: 424242 } });
    expect(await identityService.start('bob')).toEqual({
      kind: 'provideCode',
      step: 300,
      totp: 424242,
    });
  });

  test('submitCode posts the numeric code', async () => {
    const seen = mockFetch('Success');
    const result = await identityService.submitCode('bob', 12345);
    expect(result).toEqual({ kind: 'success' });
    expect(seen[0].url).toBe('/api/kanidm/v1/person/bob/_identify_user');
    expect(seen[0].body).toEqual({ SubmitCode: { other_totp: 12345 } });
  });

  test('an unknown answer rejects', async () => {
    mockFetch('Surprise');
    await expect(identityService.start('bob')).rejects.toThrow();
  });

  test('an error status rejects with ApiError', async () => {
    mockFetch({ error: { code: 'not_found', message: 'nope' } }, 404);
    await expect(identityService.start('ghost')).rejects.toMatchObject({
      name: 'ApiError',
      status: 404,
    });
  });
});
