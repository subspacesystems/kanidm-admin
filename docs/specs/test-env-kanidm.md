# test-env-kanidm: integration tests use the run's Kanidm

## Goal
The proxy integration tests can run against an already running Kanidm, named by environment variables, instead of
starting upstream's testcontainer. Without the variables they keep using the testcontainer. This is the base for later
tasks' tests.

## Behaviour
`env_or_container_router()` in `app/src/proxy/integration.rs` (a stub on main, `todo!()`) returns
`(Router, Option<TestcontainersHandle>, DevCredentials)`, the router built like `container_router` builds it (auth routes
merged with the proxy routes, over `auth::app_state_from_settings`).

- **`KANIDM_URL` set:** build a `KanidmSettings` with that url, `ca_path` from `KANIDM_CA_PATH` (required in this
  mode; panic with a clear message if missing) and `verify_ca: true`. Never disable verification and trust only that
  CA. Read the passwords from the files named by `KANIDM_ADMIN_PASSWORD_FILE` and `KANIDM_IDM_ADMIN_PASSWORD_FILE`
  (trim the trailing newline), put them in `DevCredentials`, return `None` for the handle. Never print or log a
  password; panic messages may name the variable or path only.
- **`KANIDM_URL` unset:** call `container_router()` and return its handle as `Some`.

The acceptance tests are in `app/tests/proxy_env/mod.rs` (included from `proxy/mod.rs` already, on main):
- `proxy_env_login_person_crud` runs when `KANIDM_URL` is set: login as idm_admin, create, read and delete a person
  through the proxy.
- `proxy_container_login_person_crud` is the same flow on the container (`--ignored`, needs Docker).

Keep the diff to `integration.rs`'s stub body (and its imports). Do not change the existing tests or the testcontainer
module, and add no dependencies; no refactors.

## Where to look
- `show env_or_container_router` and `show container_router` (app/src/proxy/integration.rs)
- `show KanidmSettings` (app/src/settings/kanidm.rs); `show app_state_from_settings` (app/src/auth/mod.rs)
- `show DevCredentials` (app/src/testcontainer/mod.rs)
- Helpers `login`, `call_json`, `request_with_cookie` in integration.rs
- The tests: `outline app/tests/proxy_env/mod.rs`
