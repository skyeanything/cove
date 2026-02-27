//! Shared test helpers for modules that mutate $HOME / $USERPROFILE.
//! A single global lock serializes all env-var-mutating tests across modules.

use std::ffi::OsString;
use std::path::Path;
use std::sync::Mutex;

static SERIAL: Mutex<()> = Mutex::new(());

/// Set `$HOME` (unix) and `$USERPROFILE` (windows) to a canonicalized tempdir,
/// run `f`, then restore both vars to their previous values.
pub fn with_home<F: FnOnce(&Path)>(f: F) {
    let _lock = SERIAL.lock().unwrap();
    let td = tempfile::TempDir::new().unwrap();
    let canon = td.path().canonicalize().unwrap();

    let prev_home = std::env::var_os("HOME");
    let prev_profile = std::env::var_os("USERPROFILE");
    unsafe {
        std::env::set_var("HOME", &canon);
        std::env::set_var("USERPROFILE", &canon);
    }

    f(&canon);

    restore_var("HOME", prev_home);
    restore_var("USERPROFILE", prev_profile);
}

fn restore_var(key: &str, prev: Option<OsString>) {
    match prev {
        Some(v) => unsafe { std::env::set_var(key, v) },
        None => unsafe { std::env::remove_var(key) },
    }
}
