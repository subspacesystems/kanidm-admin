# reset-gidnumber-sa: reset a service account's gidnumber

## Goal
`kanidm service-account posix reset-gidnumber <account>` deletes a POSIX service account's gidnumber so Kanidm
generates a new one. The console's service account **POSIX** tab can only set a number. Add a "Reset GID number" action
to it. Same feature as `reset-gidnumber-group` and `reset-gidnumber-person`; copy their pattern. The group spec is
`docs/specs/reset-gidnumber-group.md` and its code is on main once it merges (this task lists it in `after`).

## How Kanidm does it
- The reset is a purge of one attribute: `DELETE /v1/service_account/{id}/_attr/gidnumber`. The account stays POSIX with
  a generated number.
- A write, so step-up applies. The proxy forwards all of `/v1/` (`app/src/proxy/allowlist.rs`) and answers
  `reauth_required` to a write from a session whose privileged window has lapsed, which `AuthService.withStepUp`
  handles. **No proxy or allowlist change is needed.**

## Behaviour
- **Service**: `ServiceAccountService.purgeAttr(id, attr)` already exists in
  `app/ui/src/features/service-accounts/services/service-account.service.ts`. Add
  `resetGidnumber(id: string)` beside it that calls `this.purgeAttr(id, 'gidnumber')`, with a doc comment naming the
  CLI command.
- **UI** (`sa-posix-tab.ts`), shown only in the POSIX-enabled state (`posixState === 'enabled'`, the "POSIX
  attributes" section; not the "Enable POSIX" form). `renderPosixForm` is shared by both states, so put the button in
  `render()`'s enabled branch, not in `renderPosixForm`: a `ui-button` (`variant="secondary"`)
  `msg('Reset GID number')`, in the "POSIX attributes" section after the form, disabled while saving or resetting.
  Click opens a `confirm-dialog` (`@state() private resetOpen`), `danger`, `confirmLabel=msg('Reset')`, message
  `msg('Reset the GID number? Kanidm will generate a new one from the account, and anything using the old number stops matching.')`
  (it must start with "Reset the GID number?"; the e2e test looks for that).
  - Confirm: close the dialog, then `authService.withStepUp(() => serviceAccountService.resetGidnumber(this.id))` with
    its own flag (`@state() private resetting`, bound to the dialog's `busy`). Success:
    `notificationService.success(msg('GID number reset.'))` then `await this.load()` (refreshes the shown GID and the
    input). Failure: `notificationService.error(msg('Failed to reset the GID number.'))`.
  - Import `@/shared/components/confirm-dialog`; mirror the group tab's dialog (merged by now) and `DomainPage`'s.
- Every new string uses `msg()` and goes into all three XLIFF files (`app/ui/xliff/` ru, es, zh-Hans) through
  `bun i18n:extract` from `app/ui`; add translations for the new ids with `state="needs-review-translation"`. Find the
  new ids with grep; do not read the XLIFF files whole. "Reset GID number", "Reset", "GID number reset." and "Failed to
  reset the GID number." already exist from the group task: reuse their translations; the dialog message is new (its
  group/person versions differ by one word). Commit the regenerated `generated/locales/*.ts` too, as other tasks do.
- Nothing else changes: no other tabs, no refactors, no reformatting.

## Acceptance (tests are in the spec commit; do not edit them)
- `app/tests/proxy_sa_reset_gidnumber/mod.rs` (`proxy_env_sa_reset_gidnumber`): as `idm_admin`, a service account (managed
  by `idm_admins`) made POSIX with gidnumber 2000000 reads back that number; a bodyless `DELETE
  .../v1/service_account/{id}/_attr/gidnumber` succeeds; the unix token then shows a different number. Declared on main
  in `app/src/proxy/mod.rs`. Passes without an app change.
- `app/ui/tests/sa-reset-gidnumber.e2e.ts`: on a new service account's POSIX tab there is no reset button before saving
  POSIX attributes; after saving with 2000000 the dialog's Cancel sends nothing; confirming sends the DELETE, shows "GID
  number reset." and the shown GID is no longer 2000000. Runs with `bun run test:e2e`.
- `bunx --bun tsc --noEmit`, lint, build and `bun test` stay green; Rust tests stay green.

## Where to look
- `SaPosixTab` (`ts-show SaPosixTab.savePosix`, `SaPosixTab.load`, `SaPosixTab.render`, `SaPosixTab.renderPosixForm`) in
  `app/ui/src/features/service-accounts/components/sa-posix-tab.ts`
- `ServiceAccountService.purgeAttr`, `ServiceAccountService.posixSet` in
  `app/ui/src/features/service-accounts/services/service-account.service.ts`
- The group POSIX tab's reset (`GroupPosixTab`, `GroupService.resetGidnumber`) and `DomainPage`'s image-remove
  `confirm-dialog` (`app/ui/src/features/domain/components/domain-page.ts`)
- `AuthService.withStepUp` (`app/ui/src/features/auth/services/auth.service.ts`); `notificationService`
- The tests: `outline app/tests/proxy_sa_reset_gidnumber/mod.rs`, `ts-outline app/ui/tests/sa-reset-gidnumber.e2e.ts`
