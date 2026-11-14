# person-app-passwords-create: create a person's application password

## Goal
Kanidm's CLI creates a person's application password (`kanidm person application create NAME APPLICATION_UUID LABEL`):
it prints the id, the label and a **secret shown once**. Add a **Create application password** action to the
**Application passwords** section that `person-app-passwords-list` put on the person **Credentials** tab. Delete is a
separate task (`person-app-passwords-delete`); do not add it here.

## How Kanidm does it
- `POST /api/kanidm/scim/v1/Person/{id}/Application/_create_password` (id = name or uuid), JSON body
  `{ "applicationUuid": <application uuid>, "label": <text> }` (camelCase). The reply (200) is
  `{ "uuid": <password id>, "label": <text>, "secret": <text> }`. The secret exists only in this reply.
- Kanidm lets only the account itself write its application passwords. For an admin on **another** person Kanidm answers
  with a client error; the console shows its generic failure message and does not guess the reason. This is Kanidm's
  rule, not a bug to work around.
- **Step-up**: the proxy already answers every mutating `/api/kanidm/` call with `reauth_required` (403) before the
  upstream call when the session's write privilege has lapsed (`app/src/proxy/handler.rs`, `write_privilege`).
  `/scim/v1/` passes the allowlist (`allowlist.rs`). So **no proxy change**: the UI call goes through
  `authService.withStepUp(...)`, as the other sensitive person actions do (`PersonCredentialsTab.resetSoftlock`,
  `PersonRadiusTab.regenerate`).

## Behaviour
- **Service** (`person.service.ts`): `createApplicationPassword(id: string, applicationId: string, label: string):
  Promise<CreatedApplicationPassword>`. `apiFetch` POST to `/api/kanidm/scim/v1/Person/{encodeURIComponent(id)}/Application/_create_password`
  (the SCIM base constant `person-app-passwords-list` added), JSON body `{ applicationUuid, label }`. Map the reply to
  `CreatedApplicationPassword` (`{ id: string; label: string; secret: string }`, type in `person.types.ts` with a doc
  comment naming `ScimApplicationPassword`). The secret is never logged, cached, kept in a field of the service or put
  in a URL or `localStorage`.
- **UI** (`person-credentials-tab.ts`): in the Application passwords section add a button (`ui-button`, label
  `msg('Create application password')`) beside the heading or above the list (also shown in the empty state).
  - It opens a `ui-modal-dialog` (heading `msg('Create application password')`) with two fields in `ui-form-field`s:
    **Label** (text, required, trimmed; `msg('Label')`) and **Application** (`type="select"`; a combobox, not a native
    select; options from the application list the section already fetches, shown by display name, value = application
    id, required). Footer buttons **Cancel** and **Create** (`msg('Create')`, loading while the call runs). Submitting
    with either field empty sends nothing and shows the field's required error. If the application list is empty or
    failed to load, the select has no options and Create stays unusable (show `msg('No applications available.')` as the
    select's hint).
  - **Create** calls `authService.withStepUp(() => personService.createApplicationPassword(...))`. On failure:
    `notificationService.error(msg('Failed to create the application password.'))` and the dialog stays open with the
    form intact; no secret is displayed. On success: the dialog switches to a one-time view: text
    `msg('Application password created. Copy the secret now — it will not be shown again.')`, the label and the
    application name, the secret in a `ui-copy-field` (`msg('Secret')`, copy label `msg('Copy secret')`; follow
    `PersonRadiusTab` for the copied / copy-failed toasts and its copy button wording), and a single **Done** button
    (`msg('Done')`). Reload the section's list on success (the list shows what Kanidm returns; for an admin it may still
    be empty, that is fine).
  - **Done** (or Escape / overlay close, whichever the modal offers) closes the dialog and sets the held secret to
    `null`, so it is no longer anywhere in the DOM. The secret lives only in one `@state()` of the component; reset all
    form state when the dialog opens.
- Strings: every new string uses `msg()` and goes into all three XLIFF files (`app/ui/xliff/`: ru, es, zh-Hans)
  through `bun i18n:extract` from `app/ui`, new ids translated with `state="needs-review-translation"`. Find the new
  ids with grep, do not read the XLIFF files whole. Commit regenerated `generated/locales/*.ts` too. Other UI tasks
  append units at the end of the XLIFF files, so a merge conflict there means: keep both sides.
- Nothing else changes: no other tabs, no proxy change, no refactors, no reformatting.

## Acceptance (tests are in the spec commit; do not edit them)
- `app/tests/proxy_person_app_passwords_create/mod.rs` (`proxy_env_person_app_passwords_create`): as `idm_admin`,
  creates a person, group and application, then POSTs `_create_password` for the person through the proxy: Kanidm's
  client error comes back (not a proxy `reauth_required`, not a 5xx) with no secret in it; a body without `label` is a
  client error; cleanup. Declared on main in `app/src/proxy/mod.rs`. Passes without an app change; it pins what the
  action relies on.
- `app/ui/tests/person-app-passwords-create.e2e.ts`: with the SCIM reads and the create POST answered by fixtures, the
  Create button opens the dialog; empty submit sends nothing; label + application sends exactly
  `{ applicationUuid, label }`; the secret and the "will not be shown again" text appear, and after **Done** the secret
  is gone from the DOM; a 403 from the POST shows "Failed to create the application password." and no secret. Runs with
  `bun run test:e2e`.
- `bunx --bun tsc --noEmit`, lint, build and `bun test` stay green; Rust tests stay green.

## Where to look
- `PersonCredentialsTab` (`ts-show PersonCredentialsTab.load`, `.render`, `.resetSoftlock`, and the Application
  passwords section and `appPasswords` state from `person-app-passwords-list`) in
  `app/ui/src/features/persons/components/person-credentials-tab.ts`
- `PersonRadiusTab` (`app/ui/src/features/persons/components/person-radius-tab.ts`): `regenerate`, `copySecret`,
  `renderSecret` for one-time secret display and `withStepUp` use
- `PersonService` (`ts-outline app/ui/src/features/persons/services/person.service.ts`: `applicationPasswords`,
  `radiusRegenerate`), types in `app/ui/src/features/persons/types/person.types.ts`
- `ApplicationService.list`, `ApplicationSummary` (`app/ui/src/features/applications/`)
- Components: `UiModalDialog` (`modal-dialog.ts`), `UiFormField` (`form-field.ts`, `options`, `type="select"`, `error`),
  `UiCopyField` (`ui-copy-field.ts`), `UiButton`; `authService.withStepUp`, `notificationService`
- `apiFetch` (`app/ui/src/shared/services/http-client.ts`)
- The tests: `outline app/tests/proxy_person_app_passwords_create/mod.rs`,
  `ts-outline app/ui/tests/person-app-passwords-create.e2e.ts`
