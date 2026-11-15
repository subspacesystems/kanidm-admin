// app/tests/proxy_graph_data/mod.rs
//
// The relationship graph reads /v1/person, /v1/service_account and
// /v1/group through the proxy, against the run's Kanidm (KANIDM_URL) or
// upstream's testcontainer (--ignored, needs Docker). This checks that the
// list entries carry what the graph builder needs: `spn` and `uuid` on all
// three, and `member` (as SPNs) on a group that has members.
//
// Included from proxy/mod.rs, so `super::integration` holds the helpers.

use axum::http::StatusCode;
use serde_json::Value;

use super::integration::{call, call_json, env_or_container_router, login, request_with_cookie};
use crate::testcontainer::IDM_ADMIN_USERNAME;

const PERSON: &str = "graphdata-person";
const ACCOUNT: &str = "graphdata-sa";
const GROUP: &str = "graphdata-group";

fn find<'a>(list: &'a Value, name: &str) -> &'a Value {
    list.as_array()
        .expect("list is an array")
        .iter()
        .find(|e| e["attrs"]["name"][0] == name)
        .unwrap_or_else(|| panic!("{name} missing from list"))
}

fn first_str<'a>(entry: &'a Value, attr: &str) -> &'a str {
    entry["attrs"][attr][0]
        .as_str()
        .unwrap_or_else(|| panic!("{attr} missing: {entry}"))
}

async fn lists_carry_spn_uuid_and_member() {
    let (router, _handle, credentials) = env_or_container_router().await;
    let cookie = login(&router, IDM_ADMIN_USERNAME, &credentials.idm_admin_password).await;

    let create = |uri: &'static str, attrs: Value| {
        request_with_cookie(
            "POST",
            uri,
            &cookie,
            serde_json::json!({ "attrs": attrs }).to_string().into_bytes(),
        )
    };

    for (uri, attrs) in [
        (
            "/api/kanidm/v1/person",
            serde_json::json!({"name": [PERSON], "displayname": ["Graph Person"]}),
        ),
        (
            "/api/kanidm/v1/service_account",
            serde_json::json!({
                "name": [ACCOUNT],
                "displayname": ["Graph SA"],
                "entry_managed_by": ["idm_admins"]
            }),
        ),
        ("/api/kanidm/v1/group", serde_json::json!({"name": [GROUP]})),
    ] {
        let (status, _, body) = call(&router, create(uri, attrs)).await;
        assert!(status.is_success(), "create at {uri} failed: {status} {}", String::from_utf8_lossy(&body));
    }

    let (status, _, _) = call(
        &router,
        request_with_cookie(
            "POST",
            &format!("/api/kanidm/v1/group/{GROUP}/_attr/member"),
            &cookie,
            serde_json::json!([PERSON, ACCOUNT]).to_string().into_bytes(),
        ),
    )
    .await;
    assert!(status.is_success(), "add members failed: {status}");

    let list = |uri: &'static str| {
        let router = router.clone();
        let cookie = cookie.clone();
        async move {
            let (status, body) =
                call_json(&router, request_with_cookie("GET", uri, &cookie, Vec::new())).await;
            assert_eq!(status, StatusCode::OK, "GET {uri} failed: {body}");
            body
        }
    };
    let persons = list("/api/kanidm/v1/person").await;
    let accounts = list("/api/kanidm/v1/service_account").await;
    let groups = list("/api/kanidm/v1/group").await;

    let person = find(&persons, PERSON);
    let account = find(&accounts, ACCOUNT);
    let group = find(&groups, GROUP);
    let person_spn = first_str(person, "spn");
    let account_spn = first_str(account, "spn");
    assert!(person_spn.starts_with(PERSON), "unexpected person spn: {person_spn}");
    assert!(account_spn.starts_with(ACCOUNT), "unexpected account spn: {account_spn}");
    for entry in [person, account, group] {
        assert_eq!(first_str(entry, "uuid").len(), 36, "uuid is not a uuid: {entry}");
        assert!(entry["attrs"]["spn"][0].is_string(), "entry without an spn: {entry}");
    }

    // Group members are SPNs, matching the spn of the member entries.
    let members: Vec<&str> = group["attrs"]["member"]
        .as_array()
        .unwrap_or_else(|| panic!("group has no member: {group}"))
        .iter()
        .filter_map(Value::as_str)
        .collect();
    assert!(members.contains(&person_spn), "person spn not in {members:?}");
    assert!(members.contains(&account_spn), "account spn not in {members:?}");

    // Built-in groups are told apart by a uuid starting 00000000-0000-0000-0000-.
    let builtin = find(&groups, "idm_admins");
    assert!(
        first_str(builtin, "uuid").starts_with("00000000-0000-0000-0000-"),
        "idm_admins is not a built-in uuid: {builtin}"
    );

    for uri in [
        format!("/api/kanidm/v1/group/{GROUP}"),
        format!("/api/kanidm/v1/service_account/{ACCOUNT}"),
        format!("/api/kanidm/v1/person/{PERSON}"),
    ] {
        let (status, _, _) =
            call(&router, request_with_cookie("DELETE", &uri, &cookie, Vec::new())).await;
        assert!(status.is_success(), "cleanup {uri} failed: {status}");
    }
}

/// Runs when the run provides a Kanidm through KANIDM_URL.
#[tokio::test]
async fn proxy_env_graph_data() {
    if std::env::var_os("KANIDM_URL").is_none() {
        eprintln!("KANIDM_URL not set: skipping (see proxy_container_graph_data)");
        return;
    }
    lists_carry_spn_uuid_and_member().await;
}

/// Same flow on upstream's testcontainer (no KANIDM_URL).
#[tokio::test]
#[ignore = "requires a running Docker daemon"]
async fn proxy_container_graph_data() {
    lists_carry_spn_uuid_and_member().await;
}
