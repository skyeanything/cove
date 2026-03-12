use std::sync::{Arc, Mutex};

/// Thread-safe print output buffer for Lua print() capture.
#[derive(Clone)]
pub struct PrintCapture {
    buf: Arc<Mutex<Vec<String>>>,
}

impl PrintCapture {
    pub fn new() -> Self {
        Self {
            buf: Arc::new(Mutex::new(Vec::new())),
        }
    }

    pub fn push(&self, line: String) {
        self.buf.lock().unwrap().push(line);
    }

    pub fn join(&self, sep: &str) -> String {
        self.buf.lock().unwrap().join(sep)
    }
}
