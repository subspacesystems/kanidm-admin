# person-app-passwords-delete: delete a person's application password

## Goal
Kanidm's CLI deletes a person's application password (`kanidm person application delete NAME APPLICATION_PASSWORD_UUID`).
Add a **delete action per row** to the **Application passwords** section that `person-app-passwords-list` put on the
person **Credentials** tab (and `person-app-passwords-create` extended): confirm dialog naming the label, step-up, a
toast, then the list refreshes. Read the list and create specs and code first; this reuses their section and service.

## How Kanidm does it
- `DELETE /api/kanidm/scim/v1/Person/{id}/Application/{password_id}` (id = name or uuid; `password_id` = the `uuid` of
  the `application_password` value the list reads, i.e. `PersonApplicationPassword.id`). No request body. Success is
  200 with an empty JSON body (`null`).
- Kanidm lets only the account itself write its application passwords. For an admin on **another** person Kanidm answers
  with a client error; the console shows its generic failure message. Kanidm's rule, not a bug to work around.
- **Step-up**: the proxy already answers every mutating `/api/kanidm/` call with `reauth_required` (403) when the
  session's write privilege has lapsed, and it already forwards bodyless DELETE. **No proxy change**: the UI call goes
  through `authService.withStepUp(...)`, as create does.

## Behaviour
- **Service** (`person.service.ts`): `deleteApplicationPassword(id: string, passwordId: string): Promise<void>`,
  beside `createApplicationPassword`: `apiFetch<void>` `DELETE` on the SCIM base,
  `/Person/{encodeURIComponent(id)}/Application/{encodeURIComponent(passwordId)}`, no body. Doc comment naming the CLI
  command.
- **UI** (`person-credentials-tab.ts`): each row of the Application passwords list gets a `ui-button`
  (`variant="secondary"` or the tab's existing small/danger look, whichever the credential rows use) with the visible
  text or icon of your choice and an accessible name `msg(str\`Delete application password ${label}\`)` (the e2e finds
  it by exactly that name, e.g. "Delete application password laptop-mail"). The empty state has none.
  - Click opens a `confirm-dialog` (`@state() private deleteTarget: PersonApplicationPassword | null`), `danger`,
    `confirmLabel=msg('Delete')`, message `msg(str\`Delete the application password "${label}"? Anything using it stops
    signing in.\`)` (it must start with "Delete the application password" and contain the label; the e2e looks for
    both). Cancel clears `deleteTarget` and sends nothing.
  - Confirm: close the dialog, then `authService.withStepUp(() => personService.deleteApplicationPassword(this.id,
    target.id))` with its own flag (`@state() private deletingAppPassword`, bound to the dialog's `busy`). Success:
    `notificationService.success(msg('Application password deleted.'))`, then reload the section's list (the same
    reload create uses, which re-GETs the person entry; the row must come from that refreshed read, not be removed
    locally). Failure: `notificationService.error(msg('Failed to delete the application password.'))`; the list is
    left as it is.
  - Import `@/shared/components/confirm-dialog`; mirror the reset-gidnumber confirm in `PersonPosixTab` (merged).
- Strings: every new string uses `msg()` and goes into all three XLIFF files (`app/ui/xliff/`: ru, es, zh-Hans) through
  `bun i18n:extract` from `app/ui`, new ids translated with `state="needs-review-translation"`. "Delete" and "Cancel"
  may already exist: reuse. Find the new ids with grep, do not read the XLIFF files whole. Commit regenerated
  `generated/locales/*.ts` too. Create and other UI tasks append units at the end of the XLIFF files, so a merge
  conflict there means: keep both sides.
- Note: `person-app-passwords-list.e2e.ts` asserts the section has no delete or create button. That assertion no
  longer holds once create and delete exist; it is not this task's to fix (tests are fixed by the orchestrator) — do not
  edit it, and do not weaken your code to satisfy it.
- Nothing else changes: no other tabs, no proxy change, no refactors, no reformatting.

## Acceptance (tests are in the spec commit; do not edit them)
- `app/tests/proxy_person_app_passwords_delete/mod.rs` (`proxy_env_person_app_passwords_delete`): as `idm_admin`,
  creates a person, then a bodyless `DELETE /scim/v1/Person/{id}/Application/{random uuid}` through the proxy gets a
  Kanidm client error (not `reauth_required`, not 5xx); cleanup. Declared on main in `app/src/proxy/mod.rs`. Passes
  without an app change.
- `app/ui/tests/person-app-passwords-delete.e2e.ts`: with the SCIM reads and the DELETE answered by fixtures (person
  entry with one password until the DELETE happens), the confirm appears naming the label; Cancel sends nothing;
  Confirm sends one DELETE for the password id, shows "Application password deleted." and the row is gone after the
  refreshed read ("No application passwords."); a 403 shows "Failed to delete the application password." and keeps
  the row. Runs with `bun run test:e2e`.
- `bunx --bun tsc --noEmit`, lint, build and `bun test` stay green; Rust tests stay green.

## Where to look
- `PersonCredentialsTab` (`ts-show PersonCredentialsTab.load`, `.render`, `.renderCredRow`, and the Application
  passwords section, create dialog and `appPasswords` reload from the list and create tasks) in
  `app/ui/src/features/persons/components/person-credentials-tab.ts`
- `PersonPosixTab` (`ts-show PersonPosixTab.render`, its reset-gidnumber `confirm-dialog` and handler) in
  `app/ui/src/features/persons/components/person-posix-tab.ts`
- `PersonService` (`ts-outline app/ui/src/features/persons/services/person.service.ts`: `applicationPasswords`,
  `createApplicationPassword`, `resetGidnumber`); `PersonApplicationPassword` in `person.types.ts`
- `ConfirmDialog` (`app/ui/src/shared/components/confirm-dialog.ts`); `authService.withStepUp`; `notificationService`
- `apiFetch` (`app/ui/src/shared/services/http-client.ts`)
- The tests: `outline app/tests/proxy_person_app_passwords_delete/mod.rs`,
  `ts-outline app/ui/tests/person-app-passwords-delete.e2e.ts`
