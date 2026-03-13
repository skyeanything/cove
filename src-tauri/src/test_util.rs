//! Shared test helpers for modules that mutate $HOME / $USERPROFILE.
//! A single global lock serializes all env-var-mutating tests across modules.

use std::ffi::OsString;
use std::path::Path;
use std::sync::Mutex;

static SERIAL: Mutex<()> = Mutex::new(());

/// Set `$HOME` (unix) and `$USERPROFILE` (windows) to a canonicalized tempdir,
/// run `f`, then restore both vars to their previous values.
pub fn with_home<F: FnOnce(&Path)>(f: F) {
    with_home_inner(false, f);
}

/// Like `with_home()`, but also clears `PATH` so binary resolution tests do not
/// pick up globally installed tools from the host machine.
pub fn with_home_and_path_cleared<F: FnOnce(&Path)>(f: F) {
    with_home_inner(true, f);
}

fn with_home_inner<F: FnOnce(&Path)>(clear_path: bool, f: F) {
    let _lock = SERIAL.lock().unwrap_or_else(|e| e.into_inner());
    let td = tempfile::TempDir::new().unwrap();
    let canon = td.path().canonicalize().unwrap();

    let prev_home = std::env::var_os("HOME");
    let prev_profile = std::env::var_os("USERPROFILE");
    let prev_path = std::env::var_os("PATH");
    unsafe {
        std::env::set_var("HOME", &canon);
        std::env::set_var("USERPROFILE", &canon);
        if clear_path {
            std::env::set_var("PATH", "");
        }
    }

    f(&canon);

    restore_var("HOME", prev_home);
    restore_var("USERPROFILE", prev_profile);
    restore_var("PATH", prev_path);
}

fn restore_var(key: &str, prev: Option<OsString>) {
    match prev {
        Some(v) => unsafe { std::env::set_var(key, v) },
        None => unsafe { std::env::remove_var(key) },
    }
}
