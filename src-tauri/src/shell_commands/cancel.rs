//! Cancel token registry for aborting running shell commands.

use std::collections::HashMap;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::{Arc, Mutex};

/// A lightweight cancellation flag polled in the execution loop.
#[derive(Clone)]
pub struct CancelToken(Arc<AtomicBool>);

impl CancelToken {
    pub fn new() -> Self {
        Self(Arc::new(AtomicBool::new(false)))
    }

    pub fn is_cancelled(&self) -> bool {
        self.0.load(Ordering::Relaxed)
    }

    pub fn cancel(&self) {
        self.0.store(true, Ordering::Relaxed);
    }
}

/// Global registry mapping token keys to their cancel flags.
/// Managed as Tauri state via `Arc<CancelRegistry>`.
pub struct CancelRegistry {
    inner: Mutex<HashMap<String, CancelToken>>,
}

impl CancelRegistry {
    pub fn new() -> Self {
        Self {
            inner: Mutex::new(HashMap::new()),
        }
    }

    /// Register a new cancel token and return a clone for the runner.
    pub fn register(&self, key: &str) -> CancelToken {
        let token = CancelToken::new();
        self.inner.lock().unwrap().insert(key.to_string(), token.clone());
        token
    }

    /// Signal cancellation for the given key. Returns true if found.
    pub fn cancel(&self, key: &str) -> bool {
        if let Some(token) = self.inner.lock().unwrap().get(key) {
            token.cancel();
            true
        } else {
            false
        }
    }

    /// Remove a token after command completion.
    pub fn remove(&self, key: &str) {
        self.inner.lock().unwrap().remove(key);
    }
}
