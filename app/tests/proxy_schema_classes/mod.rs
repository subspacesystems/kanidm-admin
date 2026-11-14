// app/tests/proxy_schema_classes/mod.rs
//
// Reading the schema's classes through the proxy, against the run's Kanidm
// (KANIDM_URL) or upstream's testcontainer (--ignored, needs Docker). The
// console's class browser lists GET /v1/schema/classtype and opens one class
// with GET /v1/schema/classtype/{id}; this checks that the proxy forwards both
// and the entries carry the fields the page shows. A class names itself with
// `classname`, not `name`.
//
// Included from proxy/mod.rs, so `super::integration` holds the helpers.

use axum::http::StatusCode;

use super::integration::{call_json, env_or_container_router, login, request_with_cookie};
use crate::testcontainer::IDM_ADMIN_USERNAME;

async fn list_and_get_classes() {
    let (router, _handle, credentials) = env_or_container_router().await;
    let cookie = login(&router, IDM_ADMIN_USERNAME, &credentials.idm_admin_password).await;

    let (status, body) = call_json(
        &router,
        request_with_cookie("GET", "/api/kanidm/v1/schema/classtype", &cookie, Vec::new()),
    )
    .await;
    assert_eq!(status, StatusCode::OK, "classtype list failed: {body}");

    let entries = body.as_array().expect("classtype list is an array");
    assert!(entries.len() > 10, "suspiciously few classes: {}", entries.len());
    for entry in entries {
        assert!(
            entry["attrs"]["classname"][0].is_string(),
            "entry without a classname: {entry}"
        );
    }

    // The `person` class excludes `service_account`.
    let person = entries
        .iter()
        .find(|e| e["attrs"]["classname"][0] == "person")
        .expect("class `person` missing");
    assert!(
        person["attrs"]["systemexcludes"]
            .to_string()
            .contains("service_account"),
        "person should exclude service_account: {person}"
    );

    // One class by name.
    let (status, one) = call_json(
        &router,
        request_with_cookie("GET", "/api/kanidm/v1/schema/classtype/person", &cookie, Vec::new()),
    )
    .await;
    assert_eq!(status, StatusCode::OK, "classtype get failed: {one}");
    assert_eq!(one["attrs"]["classname"][0], "person", "wrong class: {one}");
}

/// Runs when the run provides a Kanidm through KANIDM_URL.
#[tokio::test]
async fn proxy_env_schema_classes() {
    if std::env::var_os("KANIDM_URL").is_none() {
        eprintln!("KANIDM_URL not set: skipping (see proxy_container_schema_classes)");
        return;
    }
    list_and_get_classes().await;
}

/// Same flow on upstream's testcontainer (no KANIDM_URL).
#[tokio::test]
#[ignore = "requires a running Docker daemon"]
async fn proxy_container_schema_classes() {
    list_and_get_classes().await;
}
