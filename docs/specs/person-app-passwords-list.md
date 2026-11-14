# person-app-passwords-list: list a person's application passwords

## Goal
Kanidm's CLI manages a person's application passwords (`kanidm person application create|delete`, 1.11.2). The console
has nothing for them. Add a read-only **Application passwords** section to the person **Credentials** tab that lists
each password: its label and the application it belongs to. Create and delete are separate tasks
(`person-app-passwords-create`, `-delete`); do not add them here.

## How Kanidm does it (read this; it differs from the plan's first guess)
- The 1.11.2 server has **no `GET /scim/v1/Person/{id}/Application` route** (only `_create_password` and
  `DELETE .../{password_id}`; the client method for the list hits a route that does not exist). Do not call it.
- A person's application passwords are the multi-valued `application_password` attribute of the SCIM person entry:
  `GET /scim/v1/Person/{id}` (id = name or uuid). Each value is `{ "uuid": <password id>, "applicationUuid":
  <application id>, "label": <text> }` (camelCase). The secret is never returned. If the person has none (or the caller
  may not read them) the attribute is **absent**, not an empty array: treat absent, null and `[]` alike.
- Kanidm lets only the account itself read its `application_password` values (the self-search access profile), so for an
  admin looking at **another** person the section is normally empty. That is Kanidm's rule; the section shows what
  Kanidm returns and does not claim more (see Behaviour: the empty text is neutral).
- Application names: `GET /scim/v1/Application` (existing `ApplicationService.list`, `ApplicationSummary.id` /
  `displayName`) maps `applicationUuid` to a display name. An id not found in that list shows the id itself.
- Read-only, so no step-up. `/scim/v1/` already passes the proxy (`app/src/proxy/allowlist.rs`): **no proxy change**.

## Behaviour
- **Types** (`app/ui/src/features/persons/types/person.types.ts`): add `ApplicationPasswordRef`
  (`{ uuid: string; applicationUuid: string; label: string }`, the wire shape) and `PersonApplicationPassword`
  (`{ id: string; label: string; applicationId: string; applicationName: string }`, the view model), with a doc comment
  naming the Kanidm types (`ScimApplicationPasswordReference`).
- **Service** (`app/ui/src/features/persons/services/person.service.ts`): `applicationPasswords(id: string):
  Promise<PersonApplicationPassword[]>`: `apiFetch` `GET /api/kanidm/scim/v1/Person/{encodeURIComponent(id)}`, read
  `application_password` (guard: absent, null or not an array gives `[]`), fetch the application names with
  `applicationService.list()` (import from `@/features/applications`' service file the way other features import
  siblings; check how, and avoid an import cycle), and map each value, `applicationName` = the display name, else the
  name, else the id. If the application list call fails, still return the passwords with the id as the name. The SCIM
  base is `/api/kanidm/scim/v1` (the service's `BASE` is `/api/kanidm/v1`; add a second constant like
  `message.service.ts` does).
- **UI** (`person-credentials-tab.ts`): new `@state() private appPasswords: PersonApplicationPassword[]`, loaded in
  `load()` beside the credential status (a failure to load them must not blank the tab: log nothing, show the empty
  state). Render a section **below the credentials list**, inside the tab's `<section class="credentials">`:
  a heading `msg('Application passwords')` (an `h3`, styled like the tab's other headings or plain; add styles to
  `person-credentials-tab.styles.ts` only if needed) and either
  - `ui-empty-state` (icon `key`, as the credentials list uses) with `msg('No application passwords.')`, or
  - a list (reuse the `cred-list` / row look of `renderCredRow`) with one row per password: the label, then the
    application name (`msg(str`Application: ${name}`)`-style string is fine; keep it one localized string with a
    placeholder), with the password id as a `title` attribute. When the name equals the id, show the id.
  No buttons in the section.
- Strings: every new string uses `msg()` and goes into all three XLIFF files (`app/ui/xliff/` ru, es, zh-Hans) through
  `bun i18n:extract` from `app/ui`, new ids translated with `state="needs-review-translation"`. Find the new ids with
  grep, do not read the XLIFF files whole. Commit regenerated `generated/locales/*.ts` too, as other tasks do.
  Other UI tasks append units at the end of the XLIFF files, so a merge conflict there means: keep both sides.
- Nothing else changes: no other tabs, no refactors, no reformatting.

## Acceptance (tests are in the spec commit; do not edit them)
- `app/tests/proxy_person_app_passwords/mod.rs` (`proxy_env_person_app_passwords_read`): as `idm_admin`, creates a
  person, a group and an application through the proxy; `GET /scim/v1/Person/{id}` is 200 with an `id` and no
  application passwords; `GET /scim/v1/Application` lists the created application. Declared on main in
  `app/src/proxy/mod.rs`. Passes without an app change; it pins Kanidm's behaviour the section relies on.
- `app/ui/tests/person-app-passwords-list.e2e.ts`: a new person's Credentials tab shows the heading "Application
  passwords" and "No application passwords."; with the two SCIM reads answered by fixtures (a person entry with two
  `application_password` values, an application list naming one of them) it shows both labels, the display name for
  the known application and the id for the unknown one, and no delete or create-application button. Runs with
  `bun run test:e2e`.
- `bunx --bun tsc --noEmit`, lint, build and `bun test` stay green; Rust tests stay green.

## Where to look
- `PersonCredentialsTab` (`ts-show PersonCredentialsTab.load`, `PersonCredentialsTab.render`,
  `PersonCredentialsTab.renderCredRow`) in `app/ui/src/features/persons/components/person-credentials-tab.ts`
- `PersonService` (`ts-outline app/ui/src/features/persons/services/person.service.ts`), `toPersonDetail` and the other
  types in `app/ui/src/features/persons/types/person.types.ts`
- `ApplicationService.list`, `toApplicationSummary`, `ApplicationSummary`
  (`app/ui/src/features/applications/`); `MessageService` (`app/ui/src/features/messages/services/message.service.ts`)
  for a service on the `/scim/v1` base
- `apiFetch` (`app/ui/src/shared/services/http-client.ts`); `attrList` in `app/ui/src/shared/types/kanidm.ts`
- The tests: `outline app/tests/proxy_person_app_passwords/mod.rs`,
  `ts-outline app/ui/tests/person-app-passwords-list.e2e.ts`
