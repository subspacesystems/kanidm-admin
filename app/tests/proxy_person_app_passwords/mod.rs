// app/tests/proxy_person_app_passwords/mod.rs
//
// What the person application-password list reads, through the proxy,
// against the run's Kanidm (KANIDM_URL) or upstream's testcontainer
// (--ignored, needs Docker). The console shows a person's application
// passwords from the `application_password` attribute of
// GET /scim/v1/Person/{id} (the server has no GET .../Application route),
// and names each one's application from GET /scim/v1/Application.
// Kanidm lets only a person write their own application passwords and
// only the account itself read them, so as `idm_admin` the attribute is
// absent for another person: the test pins that the person read works,
// the shape of the entry, and that a created application is listed.
//
// Included from proxy/mod.rs, so `super::integration` holds the helpers.

use axum::http::StatusCode;

use super::integration::{
    call, call_json, env_or_container_router, login, request_with_cookie,
};
use crate::testcontainer::IDM_ADMIN_USERNAME;

const PERSON: &str = "apppwd-person";
const GROUP: &str = "apppwd-users";
const APPLICATION: &str = "apppwd-app";

async fn person_application_passwords_read() {
    let (router, _handle, credentials) = env_or_container_router().await;
    let cookie = login(&router, IDM_ADMIN_USERNAME, &credentials.idm_admin_password).await;

    let body = serde_json::json!({
        "attrs": {"name": [PERSON], "displayname": ["App Password Person"]}
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
        "displayname": "App Password App",
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

    // The person entry reads as a SCIM entry; another person's
    // application passwords are not visible to idm_admin.
    let (status, entry) = call_json(
        &router,
        request_with_cookie(
            "GET",
            &format!("/api/kanidm/scim/v1/Person/{PERSON}"),
            &cookie,
            Vec::new(),
        ),
    )
    .await;
    assert_eq!(status, StatusCode::OK, "scim person read failed: {entry}");
    assert!(entry["id"].is_string(), "scim person has no id: {entry}");
    let passwords = &entry["application_password"];
    assert!(
        passwords.is_null() || passwords.as_array().is_some_and(|a| a.is_empty()),
        "unexpected application passwords: {entry}"
    );

    // The application list names the application by id.
    let (status, list) = call_json(
        &router,
        request_with_cookie("GET", "/api/kanidm/scim/v1/Application", &cookie, Vec::new()),
    )
    .await;
    assert_eq!(status, StatusCode::OK);
    let found = list["resources"]
        .as_array()
        .expect("resources array")
        .iter()
        .any(|app| app["id"] == app_id.as_str() && app["displayname"] == "App Password App");
    assert!(found, "created application not listed: {list}");

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
async fn proxy_env_person_app_passwords_read() {
    if std::env::var_os("KANIDM_URL").is_none() {
        eprintln!("KANIDM_URL not set: skipping (see proxy_container_person_app_passwords_read)");
        return;
    }
    person_application_passwords_read().await;
}

/// Same flow on upstream's testcontainer (no KANIDM_URL).
#[tokio::test]
#[ignore = "requires a running Docker daemon"]
async fn proxy_container_person_app_passwords_read() {
    person_application_passwords_read().await;
}
