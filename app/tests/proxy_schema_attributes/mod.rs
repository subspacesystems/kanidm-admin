// app/tests/proxy_schema_attributes/mod.rs
//
// Reading the schema's attribute types through the proxy, against the run's
// Kanidm (KANIDM_URL) or upstream's testcontainer (--ignored, needs Docker).
// The console's attribute browser lists GET /v1/schema/attributetype; this
// checks that the proxy forwards it and the entries carry the fields the page
// shows (name, syntax, multivalue, unique, description).
//
// Included from proxy/mod.rs, so `super::integration` holds the helpers.

use axum::http::StatusCode;

use super::integration::{call_json, env_or_container_router, login, request_with_cookie};
use crate::testcontainer::IDM_ADMIN_USERNAME;

async fn list_attribute_types() {
    let (router, _handle, credentials) = env_or_container_router().await;
    let cookie = login(&router, IDM_ADMIN_USERNAME, &credentials.idm_admin_password).await;

    let (status, body) = call_json(
        &router,
        request_with_cookie("GET", "/api/kanidm/v1/schema/attributetype", &cookie, Vec::new()),
    )
    .await;
    assert_eq!(status, StatusCode::OK, "attributetype list failed: {body}");

    let entries = body.as_array().expect("attributetype list is an array");
    assert!(entries.len() > 20, "suspiciously few attribute types: {}", entries.len());

    // Every entry has a name and a syntax.
    for entry in entries {
        let attrs = &entry["attrs"];
        assert!(attrs["name"][0].is_string(), "entry without a name: {entry}");
        assert!(attrs["syntax"][0].is_string(), "entry without a syntax: {entry}");
    }

    // The well-known `name` attribute: single-valued and unique.
    let name = entries
        .iter()
        .find(|e| e["attrs"]["name"][0] == "name")
        .expect("attribute type `name` missing");
    let multivalue = name["attrs"]["multivalue"][0].to_string();
    let unique = name["attrs"]["unique"][0].to_string();
    assert!(multivalue.contains("false"), "name should be single-valued: {name}");
    assert!(unique.contains("true"), "name should be unique: {name}");
}

/// Runs when the run provides a Kanidm through KANIDM_URL.
#[tokio::test]
async fn proxy_env_schema_attributes() {
    if std::env::var_os("KANIDM_URL").is_none() {
        eprintln!("KANIDM_URL not set: skipping (see proxy_container_schema_attributes)");
        return;
    }
    list_attribute_types().await;
}

/// Same flow on upstream's testcontainer (no KANIDM_URL).
#[tokio::test]
#[ignore = "requires a running Docker daemon"]
async fn proxy_container_schema_attributes() {
    list_attribute_types().await;
}
