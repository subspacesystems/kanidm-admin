// app/tests/proxy_group_manager/mod.rs
//
// Group entry manager through the proxy, against the run's Kanidm
// (KANIDM_URL) or upstream's testcontainer (--ignored, needs Docker).
// Setting entry_managed_by on a group is an access-control-admin
// permission, which `admin` holds and `idm_admin` does not, so the test
// signs in as `admin`.
//
// Included from proxy/mod.rs, so `super::integration` holds the helpers.

use axum::http::StatusCode;

use super::integration::{
    call, call_json, env_or_container_router, login, request_with_cookie,
};
use crate::testcontainer::ADMIN_USERNAME;

const MANAGER: &str = "emgr-managers";
const TARGET: &str = "emgr-target";

async fn entry_manager_set_read_clear() {
    let (router, _handle, credentials) = env_or_container_router().await;
    let cookie = login(&router, ADMIN_USERNAME, &credentials.admin_password).await;

    for name in [MANAGER, TARGET] {
        let body = serde_json::json!({"attrs": {"name": [name]}});
        let (status, _) = call_json(
            &router,
            request_with_cookie(
                "POST",
                "/api/kanidm/v1/group",
                &cookie,
                body.to_string().into_bytes(),
            ),
        )
        .await;
        assert!(status.is_success(), "group create {name} failed: {status}");
    }

    let attr_uri = format!("/api/kanidm/v1/group/{TARGET}/_attr/entry_managed_by");
    let group_uri = format!("/api/kanidm/v1/group/{TARGET}");

    // Unset to begin with.
    let (status, entry) =
        call_json(&router, request_with_cookie("GET", &group_uri, &cookie, Vec::new())).await;
    assert_eq!(status, StatusCode::OK);
    assert!(entry["attrs"]["entry_managed_by"].is_null(), "unexpected manager: {entry}");

    // Set (PUT replaces the single value).
    let (status, _, _) = call(
        &router,
        request_with_cookie(
            "PUT",
            &attr_uri,
            &cookie,
            serde_json::json!([MANAGER]).to_string().into_bytes(),
        ),
    )
    .await;
    assert!(status.is_success(), "set entry manager failed: {status}");

    let (status, entry) =
        call_json(&router, request_with_cookie("GET", &group_uri, &cookie, Vec::new())).await;
    assert_eq!(status, StatusCode::OK);
    let manager = entry["attrs"]["entry_managed_by"][0]
        .as_str()
        .unwrap_or_else(|| panic!("entry_managed_by not set: {entry}"));
    assert!(manager.starts_with(MANAGER), "unexpected manager value: {manager}");

    // Clear (DELETE purges the attribute).
    let (status, _, _) =
        call(&router, request_with_cookie("DELETE", &attr_uri, &cookie, Vec::new())).await;
    assert!(status.is_success(), "clear entry manager failed: {status}");

    let (status, entry) =
        call_json(&router, request_with_cookie("GET", &group_uri, &cookie, Vec::new())).await;
    assert_eq!(status, StatusCode::OK);
    assert!(entry["attrs"]["entry_managed_by"].is_null(), "manager not cleared: {entry}");

    for name in [TARGET, MANAGER] {
        let uri = format!("/api/kanidm/v1/group/{name}");
        let (status, _, _) =
            call(&router, request_with_cookie("DELETE", &uri, &cookie, Vec::new())).await;
        assert!(status.is_success(), "group delete {name} failed: {status}");
    }
}

/// Runs when the run provides a Kanidm through KANIDM_URL.
#[tokio::test]
async fn proxy_env_group_entry_manager() {
    if std::env::var_os("KANIDM_URL").is_none() {
        eprintln!("KANIDM_URL not set: skipping (see proxy_container_group_entry_manager)");
        return;
    }
    entry_manager_set_read_clear().await;
}

/// Same flow on upstream's testcontainer (no KANIDM_URL).
#[tokio::test]
#[ignore = "requires a running Docker daemon"]
async fn proxy_container_group_entry_manager() {
    entry_manager_set_read_clear().await;
}
