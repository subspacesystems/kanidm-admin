# group-entry-manager: view and set the entry manager on a group

## Goal
The group detail page shows which group manages this group (`entry_managed_by`) and lets an admin set or clear it, as
`kanidm group set-entry-manager` does. Today the console only sets the manager when creating a service account.

## Behaviour
- **Service** (`app/ui/src/features/groups/services/group.service.ts`):
  - `setEntryManager(id, manager)`: `PUT /v1/group/{id}/_attr/entry_managed_by` with body `[manager]`.
  - `clearEntryManager(id)`: `DELETE /v1/group/{id}/_attr/entry_managed_by` (purge), like `purgeDescription`.
- **UI**: a new `ui-card` titled "Entry manager" on the **Settings** tab (`group-settings-tab.ts`), after the Settings
  card and before "Rename group". Keep it independent of the Settings form's `dirty` state.
  - Shows the current manager (`detail.entryManagedBy`) in an element with `data-testid="entry-manager-current"`,
    class `mono`; when unset it shows the localized text "None".
  - A combobox `form-field` with `fieldId="grp-entry-manager"` and label "Entry managed by", options from
    `groupService.list()` (loaded when the tab loads; value `group.id`, label `displayName ?? id`), built like the one in
    the service-account create dialog.
  - Button "Set entry manager" (primary; disabled while the field is empty or busy) and button "Clear entry manager"
    (shown/enabled only when a manager is set).
  - Both writes go through `authService.withStepUp(...)`. On success: `notificationService.success` with
    "Entry manager updated." / "Entry manager cleared.", clear the field, and emit `group-changed` so the page reloads
    the detail. On failure: `notificationService.error` with "Failed to set entry manager." / "Failed to clear entry
    manager."
- Display of the value: Kanidm returns the manager as an SPN (`name@domain`) or uuid; show it as returned.
- The proxy needs no change (`/v1/` is allowed; step-up is enforced in the UI via `withStepUp`, like the other group
  writes).
- Every new string uses `msg()` and goes into all three XLIFF files with `bun i18n:extract` (from `app/ui`); machine
  translations get `state="needs-review-translation"`.
- Setting the manager needs the `idm_access_control_admins` permission, which `admin` holds and `idm_admin` does not;
  that is why the tests sign in as `admin`. Don't try to work around a 403 for other users: the existing error toast is
  the behaviour.

## Acceptance (tests are in the spec commit; do not edit them)
- `app/tests/proxy_group_manager/mod.rs` (`proxy_env_group_entry_manager`): the set/read/clear flow through the proxy.
  It should pass with no app change if the proxy forwards the calls; it also checks the Kanidm behaviour the UI relies
  on.
- `app/ui/tests/group-entry-manager.e2e.ts`: the UI flow above, with the ids, labels, button names, toast texts and
  test id given here. Runs with `bun run test:e2e` (needs the Playwright setup from `test-ui-e2e-smoke`).
- `bunx --bun tsc --noEmit`, lint and `bun test` stay green. Diff limited to this feature: no changes to other tabs.

## Where to look
- `GroupSettingsTab` (`show GroupSettingsTab.render`, `GroupSettingsTab.confirmRename`, `GroupSettingsTab.emitChanged`) in
  `app/ui/src/features/groups/components/group-settings-tab.ts`
- `groupService` (`show GroupService.purgeDescription`, `GroupService.setDescription`, `GroupService.list`)
- `GroupDetail.entryManagedBy` and `toGroupDetail` in `app/ui/src/features/groups/types/group.types.ts`
- The combobox use: `show ServiceAccountListPage.render` (field `service-account-create-managed-by`) and
  `FormField` in `app/ui/src/shared/components/form-field.ts`
- `authService.withStepUp`; `notificationService`
- The tests: `outline app/tests/proxy_group_manager/mod.rs`, `ts-outline app/ui/tests/group-entry-manager.e2e.ts`
