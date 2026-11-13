# Test modules

Each `tests/<dir>/mod.rs` is a unit-test module of the app crate, included from `src/` with `#[path]` behind
`cfg(fork_test = "<dir>")`. `build.rs` sets that cfg only when the file exists, so a module can be declared before
its test file lands. This file keeps the directory present, so `build.rs` always watches it.
