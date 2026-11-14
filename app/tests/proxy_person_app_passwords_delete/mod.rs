// app/tests/proxy_person_app_passwords_delete/mod.rs
//
// Person application-password delete through the proxy, against the run's
// Kanidm (KANIDM_URL) or upstream's testcontainer (--ignored, needs
// Docker). Kanidm lets only a person write their own application
// passwords, so this pins what the console relies on from an admin's
// session: the proxy lets a bodyless
// DELETE /scim/v1/Person/{id}/Application/{password_id} through to Kanidm
// and Kanidm answers with a client error, not a proxy envelope or a 5xx.
// The success path is covered by the UI e2e.
//
// Included from proxy/mod.rs, so `super::integration` holds the helpers.

use super::integration::{call, call_json, env_or_container_router, login, request_with_cookie};
use crate::testcontainer::IDM_ADMIN_USERNAME;

const PERSON: &str = "apppwdd-person";

async fn person_application_password_delete() {
    let (router, _handle, credentials) = env_or_container_router().await;
    let cookie = login(&router, IDM_ADMIN_USERNAME, &credentials.idm_admin_password).await;

    let body = serde_json::json!({
        "attrs": {"name": [PERSON], "displayname": ["App Password Delete"]}
    });
    let (status, _) = call_json(
        &router,
        request_with_cookie("POST", "/api/kanidm/v1/person", &cookie, body.to_string().into_bytes()),
    )
    .await;
    assert!(status.is_success(), "person create failed: {status}");

    // The delete request the console sends, for a password id that does not
    // exist (and that an admin could not delete anyway).
    let uri = format!(
        "/api/kanidm/scim/v1/Person/{PERSON}/Application/0b6c2f7e-5d1a-4e5b-9a43-7a0f6f1d2c11"
    );
    let (status, reply) =
        call_json(&router, request_with_cookie("DELETE", &uri, &cookie, Vec::new())).await;
    assert!(
        status.is_client_error(),
        "expected Kanidm to refuse the delete with a client error: {status}: {reply}"
    );
    assert_ne!(
        reply["error"]["code"], "reauth_required",
        "a fresh admin session must not need step-up: {reply}"
    );

    let (status, _, _) = call(
        &router,
        request_with_cookie("DELETE", &format!("/api/kanidm/v1/person/{PERSON}"), &cookie, Vec::new()),
    )
    .await;
    assert!(status.is_success(), "cleanup failed: {status}");
}

/// Runs when the run provides a Kanidm through KANIDM_URL.
#[tokio::test]
async fn proxy_env_person_app_passwords_delete() {
    if std::env::var_os("KANIDM_URL").is_none() {
        eprintln!("KANIDM_URL not set: skipping (see proxy_container_person_app_passwords_delete)");
        return;
    }
    person_application_password_delete().await;
}

/// Same flow on upstream's testcontainer (no KANIDM_URL).
#[tokio::test]
#[ignore = "requires a running Docker daemon"]
async fn proxy_container_person_app_passwords_delete() {
    person_application_password_delete().await;
}
