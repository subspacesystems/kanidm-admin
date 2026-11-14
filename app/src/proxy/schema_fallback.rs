// app/src/proxy/schema_fallback.rs
//
// Kanidm 1.11 moved the built-in schema out of the database but left
// the /v1/schema/attributetype list reading from it, so a stock
// 1.11.x server answers that endpoint with an empty array. Fill that
// empty answer with the built-in attribute types the same server
// version ships, keeping the attribute browser usable until the
// upstream list endpoint is restored.

use axum::body::Bytes;
use axum::http::Method;

const ATTRIBUTE_TYPES_PATH: &str = "/v1/schema/attributetype";
const ATTRIBUTE_TYPES: &str = include_str!("schema_fallback.json");

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
}
