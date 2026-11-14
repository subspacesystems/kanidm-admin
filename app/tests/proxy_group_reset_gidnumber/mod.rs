// app/tests/proxy_group_reset_gidnumber/mod.rs
//
// Resetting a group's gidnumber through the proxy, against the run's
// Kanidm (KANIDM_URL) or upstream's testcontainer (--ignored, needs
// Docker). Kanidm regenerates the gidnumber when the attribute is
// purged: DELETE /v1/group/{id}/_attr/gidnumber. The test makes a group
// POSIX with an explicit gidnumber, purges it, and expects the group to
// stay POSIX with a generated gidnumber.
//
// Included from proxy/mod.rs, so `super::integration` holds the helpers.

use axum::http::StatusCode;

use super::integration::{
    call, call_json, env_or_container_router, login, request_with_cookie,
};
use crate::testcontainer::IDM_ADMIN_USERNAME;

const GROUP: &str = "resetgid-group";
const EXPLICIT_GID: u64 = 2_000_000;

async fn reset_gidnumber() {
    let (router, _handle, credentials) = env_or_container_router().await;
    let cookie = login(&router, IDM_ADMIN_USERNAME, &credentials.idm_admin_password).await;

    let body = serde_json::json!({"attrs": {"name": [GROUP]}});
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
    assert!(status.is_success(), "group create failed: {status}");

    // Make it POSIX with an explicit gidnumber.
    let unix_uri = format!("/api/kanidm/v1/group/{GROUP}/_unix");
    let (status, _, _) = call(
        &router,
        request_with_cookie(
            "POST",
            &unix_uri,
            &cookie,
            serde_json::json!({"gidnumber": EXPLICIT_GID}).to_string().into_bytes(),
        ),
    )
    .await;
    assert!(status.is_success(), "unix extend failed: {status}");

    let token_uri = format!("/api/kanidm/v1/group/{GROUP}/_unix/_token");
    let (status, token) =
        call_json(&router, request_with_cookie("GET", &token_uri, &cookie, Vec::new())).await;
    assert_eq!(status, StatusCode::OK);
    assert_eq!(token["gidnumber"], EXPLICIT_GID, "explicit gidnumber not set: {token}");

    // Reset: purge the attribute (no body, as the console sends it).
    let attr_uri = format!("/api/kanidm/v1/group/{GROUP}/_attr/gidnumber");
    let (status, _, _) =
        call(&router, request_with_cookie("DELETE", &attr_uri, &cookie, Vec::new())).await;
    assert!(status.is_success(), "gidnumber reset failed: {status}");

    // Still POSIX, now with a generated gidnumber.
    let (status, token) =
        call_json(&router, request_with_cookie("GET", &token_uri, &cookie, Vec::new())).await;
    assert_eq!(status, StatusCode::OK, "group no longer POSIX: {token}");
    let gid = token["gidnumber"]
        .as_u64()
        .unwrap_or_else(|| panic!("no gidnumber after reset: {token}"));
    assert_ne!(gid, EXPLICIT_GID, "gidnumber was not regenerated: {token}");

    let group_uri = format!("/api/kanidm/v1/group/{GROUP}");
    let (status, _, _) =
        call(&router, request_with_cookie("DELETE", &group_uri, &cookie, Vec::new())).await;
    assert!(status.is_success(), "group delete failed: {status}");
}

/// Runs when the run provides a Kanidm through KANIDM_URL.
#[tokio::test]
async fn proxy_env_group_reset_gidnumber() {
    if std::env::var_os("KANIDM_URL").is_none() {
        eprintln!("KANIDM_URL not set: skipping (see proxy_container_group_reset_gidnumber)");
        return;
    }
    reset_gidnumber().await;
}

/// Same flow on upstream's testcontainer (no KANIDM_URL).
#[tokio::test]
#[ignore = "requires a running Docker daemon"]
async fn proxy_container_group_reset_gidnumber() {
    reset_gidnumber().await;
}
