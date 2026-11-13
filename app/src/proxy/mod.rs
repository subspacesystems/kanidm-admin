// app/src/proxy/mod.rs
//
// Generic reverse proxy to Kanidm: allowlist, privilege precheck,
// forwarding, error normalization. No per-endpoint handlers by design.

pub mod allowlist;
pub mod bulk;
pub mod error_map;
pub mod forwarder;
pub mod handler;

// The integration tests drive the real testcontainer chain, so they
// only exist when that subsystem is compiled in.
#[cfg(all(test, feature = "testcontainer"))]
mod integration;

// Tests that reach the run's Kanidm through KANIDM_URL (or the
// container fallback); the file lives under tests/ with the other
// test sources.
#[cfg(all(test, feature = "testcontainer"))]
#[path = "../../tests/proxy_env/mod.rs"]
mod env_integration;
