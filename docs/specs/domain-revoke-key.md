# domain-revoke-key: revoke a domain key

## Goal
Kanidm signs user sessions with domain keys. If one may be compromised, the CLI's
`kanidm system domain revoke-key <key-id>` revokes it, which signs every user out. The console's domain settings
page has no way to do this. Add a "Revoke key" action to **Domain** (`/admin/domain`).

## How Kanidm does it
- The domain entry has an action attribute, `key_action_revoke`. Writing a key id to it revokes that key. The call is
  `PUT /v1/domain/_attr/key_action_revoke` with body `["<key id>"]`, one id per call.
- Revoking invalidates every session signed with the key, so all users (the caller too) must sign in again. It
  can't be undone.
- The id is the key's id as the CLI takes it (a string the admin copies from elsewhere); there is no list-keys
  endpoint, so the admin types it, as the OAuth2 keys tab already does for client keys.
- Domain writes need the domain-admin role (`admin`); others get Kanidm's 403, which the error toast covers.

## Behaviour
- **Service** (`app/ui/src/features/domain/services/domain.service.ts`): add `revokeKey(keyId: string)` that sends
  the PUT above through `apiFetch` with body `JSON.stringify([keyId])`. Doc comment in the style of the others (name
  the CLI command and the attribute).
- **UI** (`domain-page.ts`): a new `ui-card` after the Image card, heading `msg('Revoke domain key')`, with:
  - a muted paragraph: `msg('Revokes a domain key by its id. Every session signed with it is invalidated, so all users must sign in again.')`
  - a `form-field` with `field-id="domain-revoke-key-id"`, label `msg('Key id')`, bound to a new
    `@state() private revokeKeyId`.
  - a `ui-button variant="danger"` in an `.actions` div, text `msg('Revoke key...')`, `?disabled` while the id is
    empty (after trim) or the revoke is running. Click opens a `confirm-dialog` (new `@state() private revokeKeyOpen`),
    the same pattern as the image-remove dialog: `danger`, `confirmLabel=msg('Revoke key')`,
    message `msg('Revoke this domain key? All sessions signed with it are invalidated and cannot be restored.')`.
    The e2e test looks for the text "Revoke this domain key?", so keep the message starting with it.
  - Confirm: `authService.withStepUp(() => domainService.revokeKey(id.trim()))`. Step-up is required, as for every
    domain write on the page. Use its own busy flag (`@state() private revokeBusy`), not the page's `busy`.
  - Success: close the dialog, clear the field, `notificationService.success(msg('Domain key revoked.'))`.
    Failure: close the dialog, keep the field, `notificationService.error(msg('Failed to revoke the domain key.'))`.
    Do not reload or sign the user out in code; if Kanidm invalidated the session, the app's existing session
    handling takes over on the next request.
  - The existing `toastError`/`run` helpers may be reused if they fit; do not change them.
- No proxy or backend change: `/v1/` is already forwarded, and the write-privilege precheck in
  `app/src/proxy/handler.rs` answers `reauth_required` to a mutating request from a session that isn't privileged;
  `withStepUp` turns that into the re-authentication prompt and retries.
- Every new string uses `msg()` and goes into all three XLIFF files (`app/ui/xliff/` ru, es, zh-Hans) through
  `bun i18n:extract` from `app/ui`; add translations for the new ids with `state="needs-review-translation"`.
  "Key id", "Revoke key", "Revoke key..." already exist (oauth2 keys tab) and share ids. The XLIFF files are large:
  find the new ids with grep, don't read them whole.
- Nothing else changes: no other cards, no refactors, no reformatting.

## Acceptance (tests are in the spec commit; do not edit them)
- `app/tests/proxy_domain_revoke_key/mod.rs` (`proxy_env_domain_revoke_key`): as `admin`, PUT an unknown key id to
  the route and get an answer that isn't a proxy refusal or permission error; the domain still reads back. It
  passes without an app change; it does not revoke a real key, which would end the run's sessions.
- `app/ui/tests/domain-revoke-key.e2e.ts`: as `admin` on `/admin/domain`, "Revoke key..." is disabled until an id is
  typed; the dialog's Cancel sends nothing; confirming sends `PUT .../v1/domain/_attr/key_action_revoke` with
  `["no-such-key"]` and shows "Domain key revoked." or "Failed to revoke the domain key.". Runs with
  `bun run test:e2e`.
- `bunx --bun tsc --noEmit`, lint, build and `bun test` stay green; Rust tests stay green.

## Where to look
- `DomainPage` (`ts-show DomainPage.removeImage`, `DomainPage.run`, `DomainPage.renderCards`) in
  `app/ui/src/features/domain/components/domain-page.ts`; the image-remove `confirm-dialog` is the pattern
- `DomainService.removeImage`, `DomainService.setSsid` in `app/ui/src/features/domain/services/domain.service.ts`
- `Oauth2KeysTab.revokeKey` (`app/ui/src/features/oauth2/components/oauth2-keys-tab.ts`) and `Oauth2Service.revokeKey`:
  same flow for client keys
- `AuthService.withStepUp` (`app/ui/src/features/auth/services/auth.service.ts`); `notificationService`
- The tests: `outline app/tests/proxy_domain_revoke_key/mod.rs`, `ts-outline app/ui/tests/domain-revoke-key.e2e.ts`
