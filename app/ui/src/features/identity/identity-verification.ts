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

// TODO(identify-user-service): implement; see docs/specs/identify-user-service.md.

/** Wire body of a request: `"Start"` or `{"SubmitCode":{"other_totp":n}}`. */
export function startRequestBody(): string {
  throw new Error('not implemented');
}

export function submitCodeRequestBody(_code: number): string {
  void _code;
  throw new Error('not implemented');
}

/** Maps the JSON Kanidm answers with; throws Error on an unknown shape. */
export function parseIdentifyResponse(_json: unknown): IdentifyResult {
  void _json;
  throw new Error('not implemented');
}

/** True for the 5 or 6 digit codes the CLI accepts (`^\d{5,6}$`). */
export function isValidCode(_text: string): boolean {
  void _text;
  throw new Error('not implemented');
}

/** The numeric code, or null when `isValidCode` is false. */
export function parseCode(_text: string): number | null {
  void _text;
  throw new Error('not implemented');
}

/** Milliseconds until the current `step`-second window ends. */
export function getMsLeftFromNow(_step: number, _nowMs?: number): number {
  void _step;
  void _nowMs;
  throw new Error('not implemented');
}

/** The state a flow begins in. */
export function initialState(): IdentifyState {
  throw new Error('not implemented');
}

/** One transition of the state machine; pure. */
export function transition(
  _state: IdentifyState,
  _event: IdentifyEvent
): IdentifyState {
  void _state;
  void _event;
  throw new Error('not implemented');
}
