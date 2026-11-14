// app/src/proxy/schema_fallback.rs
//
// Kanidm 1.11 moved the built-in schema out of the database but left
// the /v1/schema/attributetype and /v1/schema/classtype lists reading
// from it, so a stock 1.11.x server answers those endpoints with an
// empty array. Fill those empty answers with the built-in schema the
// same server version ships, keeping the schema browsers usable until
// the upstream list endpoints are restored.

use axum::body::Bytes;
use axum::http::Method;

const ATTRIBUTE_TYPES_PATH: &str = "/v1/schema/attributetype";
const ATTRIBUTE_TYPES: &str = include_str!("schema_fallback.json");
const CLASS_TYPES_PATH: &str = "/v1/schema/classtype";
const CLASS_TYPES: &str = include_str!("schema_classes_fallback.json");

/// Replace an empty attribute-type list with the built-in schema.
pub fn attribute_types(method: &Method, path_and_query: &str, body: Bytes) -> Bytes {
    let path = path_and_query.split('?').next().unwrap_or(path_and_query);
    let empty_list = serde_json::from_slice::<Vec<serde_json::Value>>(&body)
        .is_ok_and(|entries| entries.is_empty());

    if method == Method::GET && path == ATTRIBUTE_TYPES_PATH && empty_list {
        Bytes::from_static(ATTRIBUTE_TYPES.as_bytes())
    } else {
        body
    }
}

/// Replace an empty class-type list with the built-in schema, and a
/// null class lookup with the matching built-in entry.
pub fn class_types(method: &Method, path_and_query: &str, body: Bytes) -> Bytes {
    let path = path_and_query.split('?').next().unwrap_or(path_and_query);
    if method != Method::GET {
        return body;
    }

    if path == CLASS_TYPES_PATH {
        let empty_list = serde_json::from_slice::<Vec<serde_json::Value>>(&body)
            .is_ok_and(|entries| entries.is_empty());
        if empty_list {
            return Bytes::from_static(CLASS_TYPES.as_bytes());
        }
        return body;
    }

    let Some(name) = path
        .strip_prefix(CLASS_TYPES_PATH)
        .and_then(|rest| rest.strip_prefix('/'))
    else {
        return body;
    };
    let is_null = serde_json::from_slice::<serde_json::Value>(&body).is_ok_and(|value| value.is_null());
    if name.is_empty() || name.contains('/') || !is_null {
        return body;
    }

    let Ok(entries) = serde_json::from_str::<Vec<serde_json::Value>>(CLASS_TYPES) else {
        return body;
    };
    entries
        .into_iter()
        .find(|entry| entry["attrs"]["classname"][0].as_str() == Some(name))
        .and_then(|entry| serde_json::to_vec(&entry).ok())
        .map(Bytes::from)
        .unwrap_or(body)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn fills_an_empty_attribute_list() {
        let body = attribute_types(
            &Method::GET,
            "/v1/schema/attributetype",
            Bytes::from_static(b"[]"),
        );
        let entries: Vec<serde_json::Value> =
            serde_json::from_slice(&body).expect("fallback is JSON");
        assert!(entries.len() > 20);
        assert!(entries.iter().all(|entry| {
            entry["attrs"]["name"][0].is_string() && entry["attrs"]["syntax"][0].is_string()
        }));
    }

    #[test]
    fn leaves_non_empty_and_unrelated_answers_alone() {
        let answer = Bytes::from_static(br#"[{"attrs":{"name":["x"]}}]"#);
        assert_eq!(
            attribute_types(&Method::GET, "/v1/schema/attributetype", answer.clone()),
            answer
        );
        assert_eq!(
            attribute_types(&Method::GET, "/v1/person", Bytes::from_static(b"[]")),
            Bytes::from_static(b"[]")
        );
    }

    #[test]
    fn fills_an_empty_class_list() {
        let body = class_types(
            &Method::GET,
            "/v1/schema/classtype",
            Bytes::from_static(b"[]"),
        );
        let entries: Vec<serde_json::Value> =
            serde_json::from_slice(&body).expect("fallback is JSON");
        assert!(entries.len() > 10);
        assert!(entries.iter().all(|entry| {
            entry["attrs"]["classname"][0].is_string()
        }));
        assert!(entries.iter().any(|entry| {
            entry["attrs"]["classname"][0] == "person"
                && entry["attrs"]["systemexcludes"]
                    .to_string()
                    .contains("service_account")
        }));
    }

    #[test]
    fn fills_a_null_class_lookup() {
        let body = class_types(
            &Method::GET,
            "/v1/schema/classtype/person",
            Bytes::from_static(b"null"),
        );
        let entry: serde_json::Value =
            serde_json::from_slice(&body).expect("fallback is JSON");
        assert_eq!(entry["attrs"]["classname"][0], "person");
    }

    #[test]
    fn keeps_known_class_lookups() {
        let answer = Bytes::from_static(br#"{"attrs":{"classname":["person"]}}"#);
        assert_eq!(
            class_types(&Method::GET, "/v1/schema/classtype/person", answer.clone()),
            answer
        );
        let missing = Bytes::from_static(b"null");
        assert_eq!(
            class_types(&Method::GET, "/v1/schema/classtype/unknown", missing.clone()),
            missing
        );
    }
}
