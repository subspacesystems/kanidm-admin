// app/tests/proxy_person_app_passwords_create/mod.rs
//
// Person application-password create through the proxy, against the run's
// Kanidm (KANIDM_URL) or upstream's testcontainer (--ignored, needs
// Docker). Kanidm lets only a person write their own application
// passwords, and the test persons have no credential to sign in with, so
// this pins what the console relies on from an admin's session: the
// proxy lets POST /scim/v1/Person/{id}/Application/_create_password
// through to Kanidm, Kanidm refuses it with a client error, and the
// refusal carries no secret. The success shape is covered by the UI e2e.
//
// Included from proxy/mod.rs, so `super::integration` holds the helpers.

use super::integration::{
    call, call_json, env_or_container_router, login, request_with_cookie,
};
use crate::testcontainer::IDM_ADMIN_USERNAME;

const PERSON: &str = "apppwdc-person";
const GROUP: &str = "apppwdc-users";
const APPLICATION: &str = "apppwdc-app";

async fn person_application_password_create() {
    let (router, _handle, credentials) = env_or_container_router().await;
    let cookie = login(&router, IDM_ADMIN_USERNAME, &credentials.idm_admin_password).await;

    let body = serde_json::json!({
        "attrs": {"name": [PERSON], "displayname": ["App Password Create"]}
    });
    let (status, _) = call_json(
        &router,
        request_with_cookie("POST", "/api/kanidm/v1/person", &cookie, body.to_string().into_bytes()),
    )
    .await;
    assert!(status.is_success(), "person create failed: {status}");

    let body = serde_json::json!({"attrs": {"name": [GROUP]}});
    let (status, _) = call_json(
        &router,
        request_with_cookie("POST", "/api/kanidm/v1/group", &cookie, body.to_string().into_bytes()),
    )
    .await;
    assert!(status.is_success(), "group create failed: {status}");

    let body = serde_json::json!({
        "name": APPLICATION,
        "displayname": "App Password Create App",
        "linked_group": {"value": GROUP}
    });
    let (status, created) = call_json(
        &router,
        request_with_cookie(
            "POST",
            "/api/kanidm/scim/v1/Application",
            &cookie,
            body.to_string().into_bytes(),
        ),
    )
    .await;
    assert!(status.is_success(), "application create failed: {status}: {created}");
    let app_id = created["id"].as_str().expect("created application has an id").to_string();

    // The create request the console sends. The proxy forwards it (the
    // request reaches Kanidm, so the answer is Kanidm's, not the proxy's
    // 403 allowlist or reauth envelope); Kanidm refuses another account.
    let body = serde_json::json!({"applicationUuid": app_id, "label": "e2e-label"});
    let (status, reply) = call_json(
        &router,
        request_with_cookie(
            "POST",
            &format!("/api/kanidm/scim/v1/Person/{PERSON}/Application/_create_password"),
            &cookie,
            body.to_string().into_bytes(),
        ),
    )
    .await;
    assert!(
        status.is_client_error(),
        "expected Kanidm to refuse another account's application password: {status}: {reply}"
    );
    assert_ne!(
        reply["error"]["code"], "reauth_required",
        "a fresh admin session must not need step-up: {reply}"
    );
    assert!(
        !reply.to_string().contains("secret"),
        "a refusal must not carry a secret: {reply}"
    );

    // A body without the label is a client error too, never a 5xx.
    let body = serde_json::json!({"applicationUuid": app_id});
    let (status, _) = call_json(
        &router,
        request_with_cookie(
            "POST",
            &format!("/api/kanidm/scim/v1/Person/{PERSON}/Application/_create_password"),
            &cookie,
            body.to_string().into_bytes(),
        ),
    )
    .await;
    assert!(status.is_client_error(), "missing label gave {status}");

    for uri in [
        format!("/api/kanidm/scim/v1/Application/{app_id}"),
        format!("/api/kanidm/v1/group/{GROUP}"),
        format!("/api/kanidm/v1/person/{PERSON}"),
    ] {
        let (status, _, _) =
            call(&router, request_with_cookie("DELETE", &uri, &cookie, Vec::new())).await;
        assert!(status.is_success(), "cleanup of {uri} failed: {status}");
    }
}

/// Runs when the run provides a Kanidm through KANIDM_URL.
#[tokio::test]
async fn proxy_env_person_app_passwords_create() {
    if std::env::var_os("KANIDM_URL").is_none() {
        eprintln!("KANIDM_URL not set: skipping (see proxy_container_person_app_passwords_create)");
        return;
    }
    person_application_password_create().await;
}

/// Same flow on upstream's testcontainer (no KANIDM_URL).
#[tokio::test]
#[ignore = "requires a running Docker daemon"]
async fn proxy_container_person_app_passwords_create() {
    person_application_password_create().await;
}
