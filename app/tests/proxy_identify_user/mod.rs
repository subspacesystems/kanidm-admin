// app/tests/proxy_identify_user/mod.rs
//
// The identity-verification call through the proxy, against the run's
// Kanidm (KANIDM_URL) or upstream's testcontainer (--ignored, needs
// Docker). The console posts `"Start"` to /v1/person/{id}/_identify_user.
// Kanidm 1.11.2 answers a Start for the caller's own account with
// IdentityVerificationUnavailable (the two accounts must differ) and a Start
// for another account with WaitForCode or ProvideCode; it never answers
// IdentityVerificationAvailable. This pins that the proxy forwards the body
// and the answer is one of the known variants.
//
// Included from proxy/mod.rs, so `super::integration` holds the helpers.

use axum::http::StatusCode;

use super::integration::{call_json, env_or_container_router, login, request_with_cookie};
use crate::testcontainer::IDM_ADMIN_USERNAME;

const PERSON: &str = "identify-person";

const KNOWN: [&str; 4] = [
    "IdentityVerificationUnavailable",
    "WaitForCode",
    "IdentityVerificationAvailable",
    "CodeFailure",
];

fn is_known_answer(body: &serde_json::Value) -> bool {
    if let Some(name) = body.as_str() {
        return KNOWN.contains(&name);
    }
    // ProvideCode carries {"step": .., "totp": ..}.
    body["ProvideCode"]["step"].is_number() && body["ProvideCode"]["totp"].is_number()
}

async fn start_for_self_and_other() {
    let (router, _handle, credentials) = env_or_container_router().await;
    let cookie = login(&router, IDM_ADMIN_USERNAME, &credentials.idm_admin_password).await;

    let body = serde_json::json!({
        "attrs": {"name": [PERSON], "displayname": ["Identify Person"]}
    });
    let (status, _) = call_json(
        &router,
        request_with_cookie("POST", "/api/kanidm/v1/person", &cookie, body.to_string().into_bytes()),
    )
    .await;
    assert!(status.is_success(), "person create failed: {status}");

    // Start for another account: one of the known answers.
    let (status, answer) = call_json(
        &router,
        request_with_cookie(
            "POST",
            &format!("/api/kanidm/v1/person/{PERSON}/_identify_user"),
            &cookie,
            serde_json::json!("Start").to_string().into_bytes(),
        ),
    )
    .await;
    assert_eq!(status, StatusCode::OK, "start for the other person failed: {answer}");
    assert!(is_known_answer(&answer), "unexpected answer: {answer}");

    // Start for the caller's own account: unavailable.
    let (status, answer) = call_json(
        &router,
        request_with_cookie(
            "POST",
            &format!("/api/kanidm/v1/person/{IDM_ADMIN_USERNAME}/_identify_user"),
            &cookie,
            serde_json::json!("Start").to_string().into_bytes(),
        ),
    )
    .await;
    assert_eq!(status, StatusCode::OK, "start for self failed: {answer}");
    assert_eq!(answer, "IdentityVerificationUnavailable", "self start: {answer}");
}

/// Runs when the run provides a Kanidm through KANIDM_URL.
#[tokio::test]
async fn proxy_env_identify_user() {
    if std::env::var_os("KANIDM_URL").is_none() {
        eprintln!("KANIDM_URL not set: skipping (see proxy_container_identify_user)");
        return;
    }
    start_for_self_and_other().await;
}

/// Same flow on upstream's testcontainer (no KANIDM_URL).
#[tokio::test]
#[ignore = "requires a running Docker daemon"]
async fn proxy_container_identify_user() {
    start_for_self_and_other().await;
}
