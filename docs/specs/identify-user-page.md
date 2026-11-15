# identify-user-page: identity verification page for the signed-in person

## Goal
`kanidm person validity` lets two people prove to each other who they are by reading out codes. `identify-user-service`
(merged before this task: `identityService`, the pure state machine in `identity-verification.ts`) has the client and
the states; this task adds the **page**. Any signed-in person can open it (no admin group needed). Follow the layout
and style of `schema-attributes-page` and the shared components; no redesign.

## How the flow works (Kanidm 1.11.2, see the service spec)
- The caller is the session's account; `{id}` in the request is the **other** person. The server decides who goes first:
  Start answers `WaitForCode` (we first type their code) or `ProvideCode{step,totp}` (we first show ours).
- `IdentityVerificationUnavailable` is the answer when verification can't run: the domain has no verification key, the
  other account doesn't exist or isn't usable, or the other id is the caller's own. `IdentityVerificationAvailable` is
  never sent by this server, so the page does **not** start with a Start call of its own (the CLI's Start-for-self would
  only ever answer Unavailable). Instead the page begins in the state
  `transition(initialState(), {type:'started', result:{kind:'available'}})`, i.e. `idDisplayAndSubmit`, and the first
  request is the Start for the other person's id.
- Other answers than the ones the current step expects end in `failed/invalidState` (the machine does that).
- Step-up: the proxy answers every POST with `reauth_required` when the write privilege lapsed, so **every**
  `identityService` call from the page goes through `authService.withStepUp(() => ...)`. Nothing is sent as a GET.

## Behaviour
New files in `app/ui/src/features/identity/components/`: `identify-user-page.ts` (+ `identify-user-page.styles.ts`),
element `identify-user-page`, `@localized()`, inside `admin-layout`, heading **"Verify identity"**.
- **State**: `@state() private flow: IdentifyState` driven only through `transition(...)`; extra view state (the other-id
  and code text, `busy`, a `message` to show) stays in the component. The machine is not duplicated.
- **Own id** (always shown at the top, in a `ui-copy-field` labelled "Your ID", wrapped so that the element
  `data-testid="own-id"` contains the id as text): `authService.getUser()?.username` (Kanidm's SPN, e.g.
  `idm_admin@example.com`). Short hint: read it out when the other person asks for it.
- **Step `idDisplayAndSubmit`**: a `form-field` labelled **"Other person's ID"** (accessible name exactly that; trimmed
  value) and a `ui-button` **"Start verification"** (disabled when the id is empty or `busy`; Enter submits). On submit:
  `result = await withStepUp(() => identityService.start(otherId))`.
  - `result.kind === 'unavailable'`: do **not** advance; show the message "Identity verification is not available for
    this person." in the result area (`data-testid="result"`, `role="alert"`) and stay on this step.
  - otherwise `flow = transition(flow, {type:'otherIdSubmitted', otherId, result})`.
  - A rejected call (`ApiError`, network): `notificationService.error(msg('Could not start identity verification.'))`
    and stay on the step. Never put codes in notifications, `console.*` or error text.
- **Step `submitCode`**: a `form-field` **"Their code"** (accessible name exactly that; `inputmode="numeric"`,
  `autocomplete="off"`) and a `ui-button` **"Submit code"**, disabled unless `isValidCode(text)` and not `busy`; the field
  shows the hint "5 or 6 digits." Submit: `parseCode` -> `withStepUp(() => identityService.submitCode(otherId, code))`
  -> `transition(flow, {type:'codeSubmitted', result})`. A rejected call: error toast "Could not submit the code.",
  stay (keep the text). Clear the code text after any answer.
- **Steps `displayCodeFirst` / `displayCodeSecond`**: show our code (`String(selfTotp)`, monospace, large, element
  `data-testid="own-code"`) with the caption "Read this code to the other person.", and the countdown
  (`data-testid="countdown"`) as text `N seconds left`, `msg(str\`${n} seconds left\`)`, n = ceil of
  `getMsLeftFromNow(step) / 1000`, refreshed every second by a timer started when the step shows and cleared on step
  change and `disconnectedCallback`. When the window ends the countdown shows "This code has expired." and the next window's
  code can't be fetched, so offer **Start over** (see below); the confirm buttons stay enabled only while time is left.
  Below it the confirm question: "Did {otherId} correctly verify your code? You won't be able to go back." (the e2e
  looks for the part "you won't be able to go back", case-insensitive) with two buttons: **"Yes, they verified my code"**
  -> `transition(flow, {type:'confirmed'})`, and **"No, they did not verify it"** -> `{type:'declined'}`. These send
  nothing.
- **Terminal states** show their message in `data-testid="result"` (`role="alert"` for failures, `role="status"` for
  success) and a **"Start over"** button (`flow = initialState()` transitioned to `idDisplayAndSubmit` as above; clear
  the other id, codes and message):
  - `success`: "Identity verification succeeded. You have verified {otherId} and they have verified you." (must contain
    "Identity verification succeeded").
  - `failed/code`: "The verification code is invalid. Check the code with the other person, and if it remains invalid,
    they may be trying to deceive you." (contains "verification code is invalid"; the CLI's wording, reworded).
  - `failed/declined`: "Identity verification was cancelled." (contains that).
  - `failed/invalidState`: "Identity verification is in an unexpected state. Start over."
  - `unavailable` state (can't be reached through the page, since it checks first): same text as above, defensively.
  In terminal states the code elements are not rendered at all.
- Never log or store codes (no `console`, no storage, no URL); drop them from component state when the step is left.
- **Route**: `/admin/self/identify` in `app/ui/src/app-component.ts`, `enter: async () => this.guardAdmin()` (as the
  `/admin/...` routes just above `system`; not `guardSection`). `app-component.ts` imports `@/features/identity`; the
  feature's `index.ts` (created by the service task) gets a side-effect import of the new component, as the schema
  feature's barrel does.
- **Entry**: `session-indicator.ts`: in the signed-in menu (`renderMenu`), a `role="menuitem"` button/link **"Verify
  identity"** above Sign Out (after the session row's divider), which closes the menu and `navigate('/admin/self/identify')`
  (`navigate` from `@/shared/services/router.service`). The guest menu is unchanged.
- Strings: every new string uses `msg()`/`str` and goes into all three XLIFF files (`app/ui/xliff/`: ru, es, zh-Hans)
  through `bun i18n:extract` from `app/ui`; new ids translated, `state="needs-review-translation"`. Find the new ids with
  grep, do not read the XLIFF files whole. Commit regenerated `src/features/localization/generated/locales/*.ts` too.
  Other UI tasks append units at the end of the XLIFF files, so a merge conflict there means: keep both sides.
- Nothing else changes: no proxy change, no other pages, no refactors, no reformatting, no new dependency.

## Acceptance (tests are in the spec commit; do not edit them)
- `app/ui/tests/identify-user-page.e2e.ts` (`bun run test:e2e`): the session menu's "Verify identity" opens the page,
  which shows the own id; Unavailable shows the message and stays; wait-first path (code validation of 3, 7 digits, a
  letter and a space leave "Submit code" disabled; correct code sends `{"SubmitCode":{"other_totp":123456}}`; our code and
  countdown show; confirm gives success); code-first path (confirm, then their 5 digit code, success); `CodeFailure`
  shows the failure and "Start over" works; declining ends the flow with no further request. The identify calls are
  answered by route mocks (two real people can't be driven in one test).
- `identity-verification` and service unit tests (merged before) stay green; `bunx --bun tsc --noEmit`, lint, build and
  `bun test` stay green; Rust tests stay green.

## Where to look
- `identityService`, `transition`, `initialState`, `isValidCode`, `parseCode`, `getMsLeftFromNow` and the `IdentifyState`
  / `IdentifyResult` types in `app/ui/src/features/identity/` (`ts-outline` the files; `index.ts` is the barrel)
- `SchemaAttributesPage` (`ts-show SchemaAttributesPage.render`) and its `.styles.ts` for page layout, `admin-layout`,
  `ui-card`, error handling with `notificationService`
- `authService.getUser`, `authService.withStepUp` (`app/ui/src/features/auth/services/auth.service.ts`)
- `SessionIndicator.renderMenu` and `.handleSignOut` in `app/ui/src/features/auth/components/session-indicator.ts`;
  `navigate` in `app/ui/src/shared/services/router.service.ts`
- Route table and `guardAdmin` in `app/ui/src/app-component.ts`
- Components: `form-field` (event `field-input`, props `label`, `value`, `type`, `error`, `hint`), `ui-copy-field`,
  `ui-button`, `ui-card` in `app/ui/src/shared/components/`
- The test: `ts-outline app/ui/tests/identify-user-page.e2e.ts` (`mockIdentify` shows each request and answer)
