# reset-gidnumber-person: reset a person's gidnumber

## Goal
`kanidm person posix reset-gidnumber <account>` deletes a POSIX person's gidnumber so Kanidm generates a new one. The
console's person **POSIX** tab can only set a number. Add a "Reset GID number" action to it. Same feature as
`reset-gidnumber-group` (second of three); that task adds a one-line service method and a confirm dialog on the group tab,
and you copy the pattern. Its spec is `docs/specs/reset-gidnumber-group.md`, and its code is on main once it merges
(this task lists it in `after`).

## How Kanidm does it
- The reset is a purge of one attribute: `DELETE /v1/person/{id}/_attr/gidnumber` (CLI: the client's
  `idm_person_account_purge_attr` with `gidnumber`). The person stays POSIX with a generated number.
- A write, so step-up applies. The proxy forwards all of `/v1/` (`app/src/proxy/allowlist.rs`) and answers
  `reauth_required` to a write from a session whose privileged window has lapsed, which `AuthService.withStepUp`
  handles. **No proxy or allowlist change is needed.** The proxy sends `[]` for a bodyless DELETE (added by
  `group-entry-manager`), so `apiFetch` may send none.

## Behaviour
- **Service** (`app/ui/src/features/persons/services/person.service.ts`): there is no purge method yet. Add
  `resetGidnumber(id: string)` that sends a `DELETE` to `${BASE}/person/${encodeURIComponent(id)}/_attr/gidnumber`
  through `apiFetch<void>`, with a doc comment naming the CLI command. Do not add a generic `purgeAttr`.
  If `reset-gidnumber-group` introduced a shared helper by now, use it; otherwise this is self-contained.
- **UI** (`person-posix-tab.ts`), shown only in the POSIX-enabled state (`posixState === 'enabled'`, the "POSIX
  attributes" section; not the "Enable POSIX" form): a `ui-button` (`variant="secondary"`) `msg('Reset GID number')`
  next to "Save POSIX attributes" (put both in a flex row, minimal style), disabled while saving or resetting. Click
  opens a `confirm-dialog` (`@state() private resetOpen`), `danger`, `confirmLabel=msg('Reset')`, message
  `msg('Reset the GID number? Kanidm will generate a new one from the account, and anything using the old number stops matching.')`
  (it must start with "Reset the GID number?"; the e2e test looks for that).
  - Confirm: close the dialog, then `authService.withStepUp(() => personService.resetGidnumber(this.id))` with its own
    flag (`@state() private resetting`, bound to the dialog's `busy`). Success:
    `notificationService.success(msg('GID number reset.'))` then `await this.load()` (refreshes the shown GID and
    the input). Failure: `notificationService.error(msg('Failed to reset the GID number.'))`.
  - Import `@/shared/components/confirm-dialog`; mirror `DomainPage`'s dialog usage (and the group tab's, once merged).
- Every new string uses `msg()` and goes into all three XLIFF files (`app/ui/xliff/` ru, es, zh-Hans) through
  `bun i18n:extract` from `app/ui`; add translations for the new ids with `state="needs-review-translation"`. Find the new
  ids with grep; do not read the XLIFF files whole. The strings "Reset GID number", "Reset", "GID number reset." and
  "Failed to reset the GID number." may already exist from the group task: reuse their translations; only the dialog
  message is new. Commit the regenerated `generated/locales/*.ts` too, as other tasks do.
- Nothing else changes: no other tabs, no refactors, no reformatting.

## Acceptance (tests are in the spec commit; do not edit them)
- `app/tests/proxy_person_reset_gidnumber/mod.rs` (`proxy_env_person_reset_gidnumber`): as `idm_admin`, a person made
  POSIX with gidnumber 2000000 reads back that number; a bodyless `DELETE .../v1/person/{id}/_attr/gidnumber` succeeds;
  the unix token then shows a different number. Declared on main in `app/src/proxy/mod.rs`. Passes without an app change.
- `app/ui/tests/person-reset-gidnumber.e2e.ts`: on a new person's POSIX tab there is no reset button before saving POSIX
  attributes; after saving with 2000000 the dialog's Cancel sends nothing; confirming sends the DELETE, shows "GID number
  reset." and the shown "GID:" is no longer 2000000. Runs with `bun run test:e2e`.
- `bunx --bun tsc --noEmit`, lint, build and `bun test` stay green; Rust tests stay green.

## Where to look
- `PersonPosixTab` (`ts-show PersonPosixTab.savePosix`, `PersonPosixTab.load`, `PersonPosixTab.render`) in
  `app/ui/src/features/persons/components/person-posix-tab.ts`
- `PersonService.setAttr`, `PersonService.posixSet` in `app/ui/src/features/persons/services/person.service.ts`
- `DomainPage` image-remove `confirm-dialog` (`app/ui/src/features/domain/components/domain-page.ts`); the group POSIX
  tab's reset (`GroupPosixTab`, `GroupService.resetGidnumber`) once merged
- `AuthService.withStepUp` (`app/ui/src/features/auth/services/auth.service.ts`); `notificationService`
- The tests: `outline app/tests/proxy_person_reset_gidnumber/mod.rs`, `ts-outline app/ui/tests/person-reset-gidnumber.e2e.ts`
