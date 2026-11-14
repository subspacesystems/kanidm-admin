// app/tests/proxy_domain_revoke_key/mod.rs
//
// Domain key revoke through the proxy, against the run's Kanidm
// (KANIDM_URL) or upstream's testcontainer (--ignored, needs Docker).
// Kanidm revokes a domain key when the attribute `key_action_revoke` of
// the domain entry is written with the key id. Signs in as `admin`
// (a domain admin); `idm_admin` may not change the domain.
//
// The test does not revoke the domain's real key: that would sign every
// user out of the throwaway Kanidm mid-run. It pins what the console
// relies on: the route is forwarded and `admin` may write the attribute,
// so an unknown key id gets Kanidm's own answer (success or its error
// for that id), never a proxy refusal or a permission error.
//
// Included from proxy/mod.rs, so `super::integration` holds the helpers.

use axum::http::StatusCode;

use super::integration::{call, call_json, env_or_container_router, login, request_with_cookie};
use crate::testcontainer::ADMIN_USERNAME;

const REVOKE_URI: &str = "/api/kanidm/v1/domain/_attr/key_action_revoke";
const UNKNOWN_KEY_ID: &str = "00000000-no-such-key";

async fn revoke_unknown_key() {
    let (router, _handle, credentials) = env_or_container_router().await;
    let cookie = login(&router, ADMIN_USERNAME, &credentials.admin_password).await;

    let (status, _, body) = call(
        &router,
        request_with_cookie(
            "PUT",
            REVOKE_URI,
            &cookie,
            serde_json::json!([UNKNOWN_KEY_ID]).to_string().into_bytes(),
        ),
    )
    .await;
    // Not forwarded or not permitted would be 401/403/404/405/502.
    assert!(
        !matches!(
            status,
            StatusCode::UNAUTHORIZED
                | StatusCode::FORBIDDEN
                | StatusCode::NOT_FOUND
                | StatusCode::METHOD_NOT_ALLOWED
                | StatusCode::BAD_GATEWAY
        ),
        "unexpected status for an unknown key id: {status}: {body:?}"
    );

    // The domain entry still reads back, and the session is still valid.
    let (status, entries) = call_json(
        &router,
        request_with_cookie("GET", "/api/kanidm/v1/domain", &cookie, Vec::new()),
    )
    .await;
    assert_eq!(status, StatusCode::OK);
    assert!(entries[0]["attrs"]["name"][0].is_string(), "domain entry: {entries}");
}

/// Runs when the run provides a Kanidm through KANIDM_URL.
#[tokio::test]
async fn proxy_env_domain_revoke_key() {
    if std::env::var_os("KANIDM_URL").is_none() {
        eprintln!("KANIDM_URL not set: skipping (see proxy_container_domain_revoke_key)");
        return;
    }
    revoke_unknown_key().await;
}

/// Same flow on upstream's testcontainer (no KANIDM_URL).
#[tokio::test]
#[ignore = "requires a running Docker daemon"]
async fn proxy_container_domain_revoke_key() {
    revoke_unknown_key().await;
}
