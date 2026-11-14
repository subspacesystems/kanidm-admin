# reset-gidnumber-group: reset a group's gidnumber

## Goal
`kanidm group posix reset-gidnumber <group>` deletes a POSIX group's gidnumber so Kanidm generates a new one from the
group's uuid. The console's group **POSIX** tab can only set a number. Add a "Reset GID number" action to it. This is the
first of three tasks (group, person, service account); the others repeat it on their own posix tabs.

## How Kanidm does it
- The reset is a purge of one attribute: `DELETE /v1/group/{id}/_attr/gidnumber` (the CLI calls the client's
  purge-attribute function with `gidnumber`). The group stays POSIX and gets a generated number.
- A write, so step-up applies. The proxy already forwards all of `/v1/` (`app/src/proxy/allowlist.rs`) and answers
  `reauth_required` to a write from a session whose privileged window has lapsed (`app/src/proxy/handler.rs`), which
  `AuthService.withStepUp` handles. **No proxy or allowlist change is needed.**
- Kanidm's purge routes parse a JSON body even on DELETE. `group-entry-manager` makes the proxy send `[]` for a bodyless
  DELETE (this task lists it in `after`), so `apiFetch` may send none.

## Behaviour
- **Service** (`app/ui/src/features/groups/services/group.service.ts`): add `resetGidnumber(id: string)` that calls the
  existing `purgeAttr(id, 'gidnumber')`. Doc comment names the CLI command. The person and service-account tasks add
  the same one-liner to their services (both already have, or get, a `purgeAttr`); there is no other shared code, so
  there is no skeleton on main beyond the test-module declaration.
- **UI** (`group-posix-tab.ts`), shown only when the group is POSIX-enabled (the details card, not the enable form):
  - a `ui-button` (secondary) `msg('Reset GID number')` in the card's `.actions` div, left of "Save GID number";
    disabled while saving or resetting. Click opens a `confirm-dialog` (`@state() private resetOpen`), `danger`,
    `confirmLabel=msg('Reset')`, message `msg('Reset the GID number? Kanidm will generate a new one from the group, and anything using the old number stops matching.')`.
    The e2e test looks for "Reset the GID number?", so the message starts with it.
  - Confirm: close the dialog, then
    `authService.withStepUp(() => groupService.resetGidnumber(this.id))`, with its own busy flag
    (`@state() private resetting`). Success: `notificationService.success(msg('GID number reset.'))`, `emitChanged()`,
    `await this.loadToken()` (this refreshes the shown number and the input). Failure:
    `notificationService.error(msg('Failed to reset the GID number.'))`.
  - Import `@/shared/components/confirm-dialog`; mirror the domain page's dialog usage.
- Every new string uses `msg()` and goes into all three XLIFF files (`app/ui/xliff/` ru, es, zh-Hans) through
  `bun i18n:extract` from `app/ui`; add translations for the new ids with `state="needs-review-translation"`. Find the
  new ids with grep; do not read the XLIFF files whole. Commit the regenerated `generated/locales/*.ts` too, as other
  tasks do.
- Nothing else changes: no other tabs, no refactors, no reformatting.

## Acceptance (tests are in the spec commit; do not edit them)
- `app/tests/proxy_group_reset_gidnumber/mod.rs` (`proxy_env_group_reset_gidnumber`): as `idm_admin`, a group made POSIX
  with gidnumber 2000000 reads back that number; a bodyless `DELETE .../_attr/gidnumber` succeeds; the unix token then
  shows a different number. Declared on main in `app/src/proxy/mod.rs`. Passes without an app change once
  `group-entry-manager` has merged.
- `app/ui/tests/group-reset-gidnumber.e2e.ts`: on a new group's POSIX tab there is no reset button before enabling;
  after enabling with 2000000 the reset dialog's Cancel sends nothing; confirming sends the DELETE, shows
  "GID number reset." and the number is no longer 2000000. Runs with `bun run test:e2e`.
- `bunx --bun tsc --noEmit`, lint, build and `bun test` stay green; Rust tests stay green.

## Where to look
- `GroupPosixTab` (`ts-show GroupPosixTab.savePosix`, `GroupPosixTab.loadToken`, `GroupPosixTab.emitChanged`) in
  `app/ui/src/features/groups/components/group-posix-tab.ts`
- `GroupService.purgeAttr`, `GroupService.unixExtend` in `app/ui/src/features/groups/services/group.service.ts`
- `DomainPage` image-remove `confirm-dialog` (`app/ui/src/features/domain/components/domain-page.ts`): the dialog pattern
- `AuthService.withStepUp` (`app/ui/src/features/auth/services/auth.service.ts`); `notificationService`
- The tests: `outline app/tests/proxy_group_reset_gidnumber/mod.rs`, `ts-outline app/ui/tests/group-reset-gidnumber.e2e.ts`
