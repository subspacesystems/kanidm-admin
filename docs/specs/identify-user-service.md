# identify-user-service: identity verification client and state machine

## Goal
`kanidm person validity` lets two people prove who they are to each other with codes. The console has no support yet.
This task adds the client service and a pure state machine for it, with unit tests. **No UI** (`identify-user-page`
builds on this). No redesign.

## How Kanidm does it
- `POST /v1/person/{id}/_identify_user`, body a serde externally tagged enum: `"Start"` or
  `{"SubmitCode":{"other_totp":123456}}` (a number; `DisplayCode` also exists, the CLI never uses it: skip it).
- The answer is the same kind of enum: the unit variants `"IdentityVerificationUnavailable"`,
  `"IdentityVerificationAvailable"`, `"WaitForCode"`, `"CodeFailure"`, `"Success"` come as plain strings, and
  `{"ProvideCode":{"step":300,"totp":123456}}` carries the code and its window in seconds.
- `{id}` is the **other** person's id (name, SPN or uuid) for Start/SubmitCode; the caller is taken from the session.
  The server compares the two accounts' uuids: the lower uuid waits for the other's code first (`WaitForCode`), the
  higher shows its code first (`ProvideCode`). A wrong code answers `CodeFailure`; a right code answers `Success` for the
  one who showed its code first and `ProvideCode` for the one who waited.
- **Finding (1.11.2 server):** Start for one's *own* id answers `IdentityVerificationUnavailable` (the code treats equal
  uuids as unavailable), and no server path ever answers `IdentityVerificationAvailable`. So the CLI's first step (Start
  for self, expecting Available) can never pass on this server. The machine still mirrors the CLI (`start` handles both
  answers); `identify-user-page` decides how to enter the flow. Don't try to fix it here.
- The proxy already forwards `/v1/` and, being a POST, demands an active write privilege: a stale session gets
  `reauth_required` (403 envelope). The service doesn't wrap `withStepUp`; the page does.

## Behaviour
All in `app/ui/src/features/identity/`.
- **`identity-verification.ts`** (a skeleton with every name and type is on main: fill in the bodies, keep the types and
  signatures; no network, no DOM, no imports from other features):
  - `startRequestBody()` / `submitCodeRequestBody(code)`: the JSON strings above.
  - `parseIdentifyResponse(json)`: the answers above to `IdentifyResult`; any other shape throws `Error`.
  - `isValidCode(text)`: `^\d{5,6}$` exactly (no spaces or newline); `parseCode(text)`: the number (`'012345'` is
    `12345`) or `null`.
  - `getMsLeftFromNow(step, nowMs = Date.now())`: the CLI's `get_ms_left_from_now`: `step*1000 - nowMs % (step*1000)`
    (`step` in seconds; a full window is returned at the boundary).
  - `initialState()` is `{kind: 'start'}`. `transition(state, event)` is total and pure, mirroring the CLI:
    - `start` + `started`: `available` -> `idDisplayAndSubmit`; `unavailable` -> `unavailable`; any other result ->
      `failed/invalidState`.
    - `idDisplayAndSubmit` + `otherIdSubmitted{otherId, result}`: `waitForCode` -> `submitCode{otherId}`;
      `provideCode` -> `displayCodeFirst{otherId, selfTotp: totp, step}`; else `failed/invalidState`.
    - `submitCode` + `codeSubmitted`: `codeFailure` -> `failed/code`; `success` -> `success{otherId}`; `provideCode` ->
      `displayCodeSecond{otherId, selfTotp, step}`; else `failed/invalidState`.
    - `displayCodeFirst` + `confirmed` -> `submitCode{otherId}`; `displayCodeSecond` + `confirmed` -> `success{otherId}`;
      either + `declined` -> `failed/declined`.
    - Any other state/event pair -> `failed/invalidState`, except that the terminal states (`unavailable`, `success`,
      `failed`) return themselves unchanged for every event.
- **`services/identity.service.ts`**: `IdentityService` with the singleton pattern of `SchemaService` and the exported
  instance `identityService`. `start(personId)` posts `startRequestBody()` and `submitCode(personId, code: number)`
  posts `submitCodeRequestBody(code)` to `/api/kanidm/v1/person/${encodeURIComponent(personId)}/_identify_user` through
  `apiFetch` (method POST; body as the JSON string), and both return `parseIdentifyResponse(answer)`. Errors from
  `apiFetch` pass through untouched.
- **`index.ts`**: barrel exporting `identityService` and the public names of `identity-verification.ts` (types too, with
  `export type`), as the schema feature's barrel does. No custom elements, no routes, no strings: **no XLIFF changes.**
- No new dependencies, no refactors, no reformatting.

## Acceptance (tests are in the spec commit; do not edit them)
- `app/ui/tests/identity-verification.test.ts` and `app/ui/tests/identity-service.test.ts`: every transition above, the
  wire mapping, the code helpers and the service's requests (`bun test` from `app/ui`).
- `app/tests/proxy_identify_user/mod.rs` (`proxy_env_identify_user`): as `idm_admin`, Start for a new person answers
  one of the known variants; Start for `idm_admin` itself answers `IdentityVerificationUnavailable`. Declared on main in
  `app/src/proxy/mod.rs`. Passes without an app change.
- `bunx --bun tsc --noEmit`, lint and build stay green (the tests are outside `src`, so only the source is typechecked);
  Rust tests stay green.

## Where to look
- The skeleton: `ts-outline app/ui/src/features/identity/identity-verification.ts` (types are final)
- `SchemaService` (`ts-outline app/ui/src/features/schema/services/schema.service.ts`) for the singleton and `apiFetch`
  use; `apiFetch` and `ApiError` in `app/ui/src/shared/services/http-client.ts`
- The barrel: `app/ui/src/features/schema/index.ts`
- The tests: `ts-outline app/ui/tests/identity-verification.test.ts`, `ts-outline app/ui/tests/identity-service.test.ts`,
  `outline app/tests/proxy_identify_user/mod.rs`
