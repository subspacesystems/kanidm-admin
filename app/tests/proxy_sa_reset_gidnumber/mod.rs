// app/tests/proxy_sa_reset_gidnumber/mod.rs
//
// Resetting a service account's gidnumber through the proxy, against the run's
// Kanidm (KANIDM_URL) or upstream's testcontainer (--ignored, needs
// Docker). Kanidm regenerates the gidnumber when the attribute is
// purged: DELETE /v1/service_account/{id}/_attr/gidnumber. The test makes a service account
// POSIX with an explicit gidnumber, purges it, and expects the service account to
// stay POSIX with a generated gidnumber.
//
// Included from proxy/mod.rs, so `super::integration` holds the helpers.

use axum::http::StatusCode;

use super::integration::{
    call, call_json, env_or_container_router, login, request_with_cookie,
};
use crate::testcontainer::IDM_ADMIN_USERNAME;

const ACCOUNT: &str = "resetgid-sa";
const EXPLICIT_GID: u64 = 2_000_000;

async fn reset_gidnumber() {
    let (router, _handle, credentials) = env_or_container_router().await;
    let cookie = login(&router, IDM_ADMIN_USERNAME, &credentials.idm_admin_password).await;

    let body = serde_json::json!({"attrs": {"name": [ACCOUNT], "displayname": ["Reset GID"], "entry_managed_by": ["idm_admins"]}});
    let (status, _) = call_json(
        &router,
        request_with_cookie(
            "POST",
            "/api/kanidm/v1/service_account",
            &cookie,
            body.to_string().into_bytes(),
        ),
    )
    .await;
    assert!(status.is_success(), "service account create failed: {status}");

    // Make it POSIX with an explicit gidnumber (shell left to the default).
    let unix_uri = format!("/api/kanidm/v1/service_account/{ACCOUNT}/_unix");
    let (status, _, _) = call(
        &router,
        request_with_cookie(
            "POST",
            &unix_uri,
            &cookie,
            serde_json::json!({"gidnumber": EXPLICIT_GID, "shell": null}).to_string().into_bytes(),
        ),
    )
    .await;
    assert!(status.is_success(), "unix extend failed: {status}");

    let token_uri = format!("/api/kanidm/v1/account/{ACCOUNT}/_unix/_token");
    let (status, token) =
        call_json(&router, request_with_cookie("GET", &token_uri, &cookie, Vec::new())).await;
    assert_eq!(status, StatusCode::OK);
    assert_eq!(token["gidnumber"], EXPLICIT_GID, "explicit gidnumber not set: {token}");

    // Reset: purge the attribute (no body, as the console sends it).
    let attr_uri = format!("/api/kanidm/v1/service_account/{ACCOUNT}/_attr/gidnumber");
    let (status, _, _) =
        call(&router, request_with_cookie("DELETE", &attr_uri, &cookie, Vec::new())).await;
    assert!(status.is_success(), "gidnumber reset failed: {status}");

    // Still POSIX, now with a generated gidnumber.
    let (status, token) =
        call_json(&router, request_with_cookie("GET", &token_uri, &cookie, Vec::new())).await;
    assert_eq!(status, StatusCode::OK, "account no longer POSIX: {token}");
    let gid = token["gidnumber"]
        .as_u64()
        .unwrap_or_else(|| panic!("no gidnumber after reset: {token}"));
    assert_ne!(gid, EXPLICIT_GID, "gidnumber was not regenerated: {token}");

    let sa_uri = format!("/api/kanidm/v1/service_account/{ACCOUNT}");
    let (status, _, _) =
        call(&router, request_with_cookie("DELETE", &sa_uri, &cookie, Vec::new())).await;
    assert!(status.is_success(), "service account delete failed: {status}");
}

/// Runs when the run provides a Kanidm through KANIDM_URL.
#[tokio::test]
async fn proxy_env_sa_reset_gidnumber() {
    if std::env::var_os("KANIDM_URL").is_none() {
        eprintln!("KANIDM_URL not set: skipping (see proxy_container_sa_reset_gidnumber)");
        return;
    }
    reset_gidnumber().await;
}

/// Same flow on upstream's testcontainer (no KANIDM_URL).
#[tokio::test]
#[ignore = "requires a running Docker daemon"]
async fn proxy_container_sa_reset_gidnumber() {
    reset_gidnumber().await;
}
