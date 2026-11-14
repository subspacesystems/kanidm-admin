# person-softlock-reset: clear a person's softlock

## Goal
After too many failed sign-in attempts Kanidm softlocks an account's credentials for a while. The CLI's
`kanidm person credential softlock-reset <id>` clears that early; the console has no way to do it. Add a
"Clear softlock" action to the person **Credentials** tab.

## How Kanidm does it
- Softlocks live in the server's memory. The person attribute `account_softlock_expire` (a single UTC datetime)
  tells the server to drop every softlock that began before that time. Clearing a softlock therefore means writing
  the current time to that attribute; it applies to all of the account's credentials.
- Write it with the existing generic attribute call: `PUT /v1/person/{id}/_attr/account_softlock_expire` with body
  `["<RFC 3339 UTC time>"]`. `new Date().toISOString()` (for example `2026-11-13T05:43:00.123Z`) is accepted.
- Like the CLI, the time comes from the caller's clock (the browser here); no server-side time lookup.
- `idm_admin` (people admins, service desk) may write it; others get Kanidm's 403, which the normal error toast
  covers.

## Behaviour
- **Service** (`app/ui/src/features/persons/services/person.service.ts`): add `resetSoftlock(id: string)` that writes
  `new Date().toISOString()` to `account_softlock_expire` through `setAttr` (one value). Doc comment in the style of
  the others (name the CLI command and the attribute).
- **UI** (`person-credentials-tab.ts`): a third `ui-button` in the existing `.actions` row, after "Email reset link":
  - text "Clear softlock", `icon="lock"`, default (non-primary) variant, `?loading` while the call runs, and disabled
    while another action on the tab is submitting.
  - Click: `authService.withStepUp(() => personService.resetSoftlock(this.id))`. The step-up wrapper is required: it
    is a credential operation, like the reset link next to it. No confirm dialog (nothing is lost).
  - Success: `notificationService.success(msg('Softlock cleared.'))`. Failure:
    `notificationService.error(msg('Failed to clear softlock.'))`.
  - Use its own busy flag (e.g. `@state() private softlockBusy`), so it doesn't spin the reset-link button.
- No proxy or backend change: `/v1/` is already forwarded, and the proxy's write-privilege precheck
  (`app/src/proxy/handler.rs`) answers `reauth_required` to any mutating request from a session that isn't privileged;
  `withStepUp` turns that into the re-authentication prompt and retries.
- Every new string uses `msg()` and goes into all three XLIFF files (`app/ui/xliff/` ru, es, zh-Hans) with
  `bun i18n:extract` from `app/ui`; add the translations for the new ids with
  `state="needs-review-translation"`. The XLIFF files are large: find the new ids with grep, don't read them whole.
- Nothing else changes: no other tabs, no refactors, no reformatting.

## Acceptance (tests are in the spec commit; do not edit them)
- `app/tests/proxy_person_softlock/mod.rs` (`proxy_env_person_softlock_reset`): set, read back and purge
  `account_softlock_expire` through the proxy as `idm_admin`. It passes without an app change; it pins the Kanidm
  behaviour (permission, accepted time format) the button relies on.
- `app/ui/tests/person-softlock-reset.e2e.ts`: creates a person, opens its Credentials tab, clicks
  "Clear softlock", expects the toast "Softlock cleared." and a stored `account_softlock_expire` within a few minutes
  of the click. Runs with `bun run test:e2e` (Playwright setup from `test-ui-e2e-smoke`).
- `bunx --bun tsc --noEmit`, lint, build and `bun test` stay green; Rust tests stay green.

## Where to look
- `PersonCredentialsTab` (`ts-show PersonCredentialsTab.render`, `PersonCredentialsTab.handleCreateIntent`) in
  `app/ui/src/features/persons/components/person-credentials-tab.ts`
- `PersonService.setAttr`, `PersonService.credentialUpdateIntent` in `app/ui/src/features/persons/services/person.service.ts`
- `AuthService.withStepUp` (`app/ui/src/features/auth/services/auth.service.ts`); `notificationService`
- `ICON_NAMES` in `app/ui/src/shared/components/ui-icon.ts` (`lock` exists)
- The tests: `outline app/tests/proxy_person_softlock/mod.rs`, `ts-outline app/ui/tests/person-softlock-reset.e2e.ts`
