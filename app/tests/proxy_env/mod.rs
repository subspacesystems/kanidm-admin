// app/tests/proxy_env/mod.rs
//
// Proxy integration test against the run's Kanidm. With KANIDM_URL set
// it talks to that server (CA from KANIDM_CA_PATH, passwords from the
// KANIDM_*_PASSWORD_FILE files); otherwise the container variant below
// starts upstream's testcontainer (needs Docker, run with --ignored).
//
// Included from proxy/mod.rs, so `super::integration` holds the helpers.

use axum::http::StatusCode;

use super::integration::{
    call_json, env_or_container_router, login, request_with_cookie,
};
use crate::testcontainer::IDM_ADMIN_USERNAME;

const PERSON: &str = "envperson";

/// Log in as idm_admin, then create, read and delete a person.
async fn login_and_person_crud() {
    let (router, _handle, credentials) = env_or_container_router().await;
    let cookie = login(&router, IDM_ADMIN_USERNAME, &credentials.idm_admin_password).await;

    let body = serde_json::json!({
        "attrs": {"name": [PERSON], "displayname": ["Env Person"]}
    });
    let (status, _) = call_json(
        &router,
        request_with_cookie(
            "POST",
            "/api/kanidm/v1/person",
            &cookie,
            body.to_string().into_bytes(),
        ),
    )
    .await;
    assert!(status.is_success(), "person create failed: {status}");

    let uri = format!("/api/kanidm/v1/person/{PERSON}");
    let (status, entry) =
        call_json(&router, request_with_cookie("GET", &uri, &cookie, Vec::new())).await;
    assert_eq!(status, StatusCode::OK);
    assert_eq!(entry["attrs"]["name"][0], PERSON);
    assert_eq!(entry["attrs"]["displayname"][0], "Env Person");

    let (status, _, _) = super::integration::call(
        &router,
        request_with_cookie("DELETE", &uri, &cookie, Vec::new()),
    )
    .await;
    assert!(status.is_success(), "person delete failed: {status}");

    // Deleted: the entry no longer reads back as a person.
    let (status, entry) =
        call_json(&router, request_with_cookie("GET", &uri, &cookie, Vec::new())).await;
    assert!(
        !status.is_success() || entry.is_null(),
        "deleted person must not be readable, got {status}: {entry}"
    );
}

/// Runs when the run provides a Kanidm through KANIDM_URL; otherwise it
/// returns at once (the container variant covers that setup).
#[tokio::test]
async fn proxy_env_login_person_crud() {
    if std::env::var_os("KANIDM_URL").is_none() {
        eprintln!("KANIDM_URL not set: skipping (see proxy_container_login_person_crud)");
        return;
    }
    login_and_person_crud().await;
}

/// Same flow on upstream's testcontainer (no KANIDM_URL).
#[tokio::test]
#[ignore = "requires a running Docker daemon"]
async fn proxy_container_login_person_crud() {
    login_and_person_crud().await;
}
