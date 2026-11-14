// app/tests/proxy_person_softlock/mod.rs
//
// Person softlock reset through the proxy, against the run's Kanidm
// (KANIDM_URL) or upstream's testcontainer (--ignored, needs Docker).
// Kanidm keeps softlocks in memory; writing a time to the person's
// account_softlock_expire attribute drops every lock that started
// before it. The console writes the browser's current time in the
// format `Date.toISOString()` produces (UTC, milliseconds), so the
// test sends that shape. Signs in as `idm_admin`, which may reset
// people's credentials.
//
// Included from proxy/mod.rs, so `super::integration` holds the helpers.

use axum::http::StatusCode;

use super::integration::{
    call, call_json, env_or_container_router, login, request_with_cookie,
};
use crate::testcontainer::IDM_ADMIN_USERNAME;

const PERSON: &str = "slockperson";
const RESET_AT: &str = "2026-01-02T03:04:05.678Z";

async fn softlock_reset_set_read_clear() {
    let (router, _handle, credentials) = env_or_container_router().await;
    let cookie = login(&router, IDM_ADMIN_USERNAME, &credentials.idm_admin_password).await;

    let body = serde_json::json!({
        "attrs": {"name": [PERSON], "displayname": ["Softlock Person"]}
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

    let person_uri = format!("/api/kanidm/v1/person/{PERSON}");
    let attr_uri = format!("{person_uri}/_attr/account_softlock_expire");

    // Unset on a new person.
    let (status, entry) =
        call_json(&router, request_with_cookie("GET", &person_uri, &cookie, Vec::new())).await;
    assert_eq!(status, StatusCode::OK);
    assert!(
        entry["attrs"]["account_softlock_expire"].is_null(),
        "unexpected softlock expiry: {entry}"
    );

    // Reset: PUT replaces the single datetime value.
    let (status, _, _) = call(
        &router,
        request_with_cookie(
            "PUT",
            &attr_uri,
            &cookie,
            serde_json::json!([RESET_AT]).to_string().into_bytes(),
        ),
    )
    .await;
    assert!(status.is_success(), "softlock reset failed: {status}");

    let (status, entry) =
        call_json(&router, request_with_cookie("GET", &person_uri, &cookie, Vec::new())).await;
    assert_eq!(status, StatusCode::OK);
    let value = entry["attrs"]["account_softlock_expire"][0]
        .as_str()
        .unwrap_or_else(|| panic!("account_softlock_expire not set: {entry}"));
    assert!(
        value.starts_with("2026-01-02T03:04:05"),
        "unexpected softlock expiry value: {value}"
    );

    // DELETE purges the attribute again.
    let (status, _, _) =
        call(&router, request_with_cookie("DELETE", &attr_uri, &cookie, Vec::new())).await;
    assert!(status.is_success(), "softlock expiry purge failed: {status}");

    let (status, entry) =
        call_json(&router, request_with_cookie("GET", &person_uri, &cookie, Vec::new())).await;
    assert_eq!(status, StatusCode::OK);
    assert!(
        entry["attrs"]["account_softlock_expire"].is_null(),
        "softlock expiry not purged: {entry}"
    );

    let (status, _, _) =
        call(&router, request_with_cookie("DELETE", &person_uri, &cookie, Vec::new())).await;
    assert!(status.is_success(), "person delete failed: {status}");
}

/// Runs when the run provides a Kanidm through KANIDM_URL.
#[tokio::test]
async fn proxy_env_person_softlock_reset() {
    if std::env::var_os("KANIDM_URL").is_none() {
        eprintln!("KANIDM_URL not set: skipping (see proxy_container_person_softlock_reset)");
        return;
    }
    softlock_reset_set_read_clear().await;
}

/// Same flow on upstream's testcontainer (no KANIDM_URL).
#[tokio::test]
#[ignore = "requires a running Docker daemon"]
async fn proxy_container_person_softlock_reset() {
    softlock_reset_set_read_clear().await;
}
