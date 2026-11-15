// Identity verification ("identify user"): pure types, wire mapping and
// the state machine. Mirrors the states of `kanidm person validity` (the
// CLI's identify_user_no_tui flow). No network and no DOM in this file.

/** Kanidm's IdentifyUserResponse, mapped to a tagged union. */
export type IdentifyResult =
  | { kind: 'unavailable' }
  | { kind: 'available' }
  | { kind: 'waitForCode' }
  | { kind: 'provideCode'; step: number; totp: number }
  | { kind: 'codeFailure' }
  | { kind: 'success' };

/** Why a flow ended without success. */
export type IdentifyFailure = 'code' | 'invalidState' | 'declined';

export type IdentifyState =
  | { kind: 'start' }
  | { kind: 'idDisplayAndSubmit' }
  | { kind: 'submitCode'; otherId: string }
  | {
      kind: 'displayCodeFirst';
      otherId: string;
      selfTotp: number;
      step: number;
    }
  | {
      kind: 'displayCodeSecond';
      otherId: string;
      selfTotp: number;
      step: number;
    }
  | { kind: 'unavailable' }
  | { kind: 'success'; otherId: string }
  | { kind: 'failed'; reason: IdentifyFailure };

export type IdentifyEvent =
  | { type: 'started'; result: IdentifyResult }
  | { type: 'otherIdSubmitted'; otherId: string; result: IdentifyResult }
  | { type: 'codeSubmitted'; result: IdentifyResult }
  | { type: 'confirmed' }
  | { type: 'declined' };

/** Wire body of a request: `"Start"` or `{"SubmitCode":{"other_totp":n}}`. */
export function startRequestBody(): string {
  return JSON.stringify('Start');
}

export function submitCodeRequestBody(code: number): string {
  return JSON.stringify({ SubmitCode: { other_totp: code } });
}

/** Maps the JSON Kanidm answers with; throws Error on an unknown shape. */
export function parseIdentifyResponse(json: unknown): IdentifyResult {
  if (typeof json === 'string') {
    switch (json) {
      case 'IdentityVerificationUnavailable':
        return { kind: 'unavailable' };
      case 'IdentityVerificationAvailable':
        return { kind: 'available' };
      case 'WaitForCode':
        return { kind: 'waitForCode' };
      case 'CodeFailure':
        return { kind: 'codeFailure' };
      case 'Success':
        return { kind: 'success' };
    }
  }
  if (typeof json === 'object' && json !== null && 'ProvideCode' in json) {
    const body = (json as { ProvideCode: unknown }).ProvideCode;
    if (
      typeof body === 'object' &&
      body !== null &&
      typeof (body as { step?: unknown }).step === 'number' &&
      typeof (body as { totp?: unknown }).totp === 'number'
    ) {
      return {
        kind: 'provideCode',
        step: (body as { step: number }).step,
        totp: (body as { totp: number }).totp,
      };
    }
  }
  throw new Error(`Unknown identify response: ${JSON.stringify(json)}`);
}

/** True for the 5 or 6 digit codes the CLI accepts (`^\d{5,6}$`). */
export function isValidCode(text: string): boolean {
  return /^\d{5,6}$/.test(text);
}

/** The numeric code, or null when `isValidCode` is false. */
export function parseCode(text: string): number | null {
  return isValidCode(text) ? Number(text) : null;
}

/** Milliseconds until the current `step`-second window ends. */
export function getMsLeftFromNow(
  step: number,
  nowMs: number = Date.now()
): number {
  const windowMs = step * 1000;
  return windowMs - (nowMs % windowMs);
}

/** The state a flow begins in. */
export function initialState(): IdentifyState {
  return { kind: 'start' };
}

const failed = (reason: IdentifyFailure): IdentifyState => ({
  kind: 'failed',
  reason,
});

/** One transition of the state machine; pure. */
export function transition(
  state: IdentifyState,
  event: IdentifyEvent
): IdentifyState {
  // Terminal states absorb every event.
  if (
    state.kind === 'unavailable' ||
    state.kind === 'success' ||
    state.kind === 'failed'
  ) {
    return state;
  }

  switch (state.kind) {
    case 'start': {
      if (event.type !== 'started') {
        return failed('invalidState');
      }
      if (event.result.kind === 'available') {
        return { kind: 'idDisplayAndSubmit' };
      }
      if (event.result.kind === 'unavailable') {
        return { kind: 'unavailable' };
      }
      return failed('invalidState');
    }
    case 'idDisplayAndSubmit': {
      if (event.type !== 'otherIdSubmitted') {
        return failed('invalidState');
      }
      if (event.result.kind === 'waitForCode') {
        return { kind: 'submitCode', otherId: event.otherId };
      }
      if (event.result.kind === 'provideCode') {
        return {
          kind: 'displayCodeFirst',
          otherId: event.otherId,
          selfTotp: event.result.totp,
          step: event.result.step,
        };
      }
      return failed('invalidState');
    }
    case 'submitCode': {
      if (event.type !== 'codeSubmitted') {
        return failed('invalidState');
      }
      if (event.result.kind === 'codeFailure') {
        return failed('code');
      }
      if (event.result.kind === 'success') {
        return { kind: 'success', otherId: state.otherId };
      }
      if (event.result.kind === 'provideCode') {
        return {
          kind: 'displayCodeSecond',
          otherId: state.otherId,
          selfTotp: event.result.totp,
          step: event.result.step,
        };
      }
      return failed('invalidState');
    }
    case 'displayCodeFirst': {
      if (event.type === 'confirmed') {
        return { kind: 'submitCode', otherId: state.otherId };
      }
      if (event.type === 'declined') {
        return failed('declined');
      }
      return failed('invalidState');
    }
    case 'displayCodeSecond': {
      if (event.type === 'confirmed') {
        return { kind: 'success', otherId: state.otherId };
      }
      if (event.type === 'declined') {
        return failed('declined');
      }
      return failed('invalidState');
    }
  }
}
