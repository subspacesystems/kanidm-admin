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
// test sources. build.rs sets `fork_test = "<dir>"` only when
// tests/<dir>/mod.rs exists, so a module declared before its test
// file lands still compiles.
#[cfg(all(test, feature = "testcontainer", fork_test = "proxy_env"))]
#[path = "../../tests/proxy_env/mod.rs"]
mod env_integration;

// Group entry manager set/clear through the proxy; same setup as above.
#[cfg(all(test, feature = "testcontainer", fork_test = "proxy_group_manager"))]
#[path = "../../tests/proxy_group_manager/mod.rs"]
mod group_manager_integration;

// Person softlock reset through the proxy; same setup as above.
#[cfg(all(test, feature = "testcontainer", fork_test = "proxy_person_softlock"))]
#[path = "../../tests/proxy_person_softlock/mod.rs"]
mod person_softlock_integration;

// Domain key revoke through the proxy; same setup as above.
#[cfg(all(test, feature = "testcontainer", fork_test = "proxy_domain_revoke_key"))]
#[path = "../../tests/proxy_domain_revoke_key/mod.rs"]
mod domain_revoke_key_integration;

// Group gidnumber reset through the proxy; same setup as above.
#[cfg(all(test, feature = "testcontainer", fork_test = "proxy_group_reset_gidnumber"))]
#[path = "../../tests/proxy_group_reset_gidnumber/mod.rs"]
mod group_reset_gidnumber_integration;

// Person gidnumber reset through the proxy; same setup as above.
#[cfg(all(test, feature = "testcontainer", fork_test = "proxy_person_reset_gidnumber"))]
#[path = "../../tests/proxy_person_reset_gidnumber/mod.rs"]
mod person_reset_gidnumber_integration;

// Service account gidnumber reset through the proxy; same setup as above.
#[cfg(all(test, feature = "testcontainer", fork_test = "proxy_sa_reset_gidnumber"))]
#[path = "../../tests/proxy_sa_reset_gidnumber/mod.rs"]
mod sa_reset_gidnumber_integration;
