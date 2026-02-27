use super::parsing::{format_exit_status, parse_response};

// ── parse_response ──────────────────────────────────────────────────────

#[test]
fn parse_response_success_with_output() {
    let json = r#"{"id":1,"result":{"output":{"status":"success","data":"ok"}}}"#;
    let r = parse_response(json).unwrap();
    assert_eq!(r.status, "success");
    assert_eq!(r.data, serde_json::json!("ok"));
    assert!(r.error.is_none());
}

#[test]
fn parse_response_success_without_output_key() {
    let json = r#"{"id":1,"result":{"foo":"bar"}}"#;
    let r = parse_response(json).unwrap();
    assert_eq!(r.status, "success");
    assert_eq!(r.data, serde_json::json!({"foo":"bar"}));
}

#[test]
fn parse_response_error_response() {
    let json = r#"{"id":1,"error":{"code":-1,"message":"fail"}}"#;
    let r = parse_response(json).unwrap();
    assert_eq!(r.status, "error");
    assert_eq!(r.error.as_deref(), Some("fail"));
    assert_eq!(r.data, serde_json::Value::Null);
}

#[test]
fn parse_response_invalid_json() {
    let err = parse_response("not json").unwrap_err();
    assert!(err.contains("解析 JSON-RPC 响应失败"));
}

#[test]
fn parse_response_failure_normalized() {
    let json =
        r#"{"id":1,"result":{"output":{"status":"failure","data":null}}}"#;
    let r = parse_response(json).unwrap();
    assert_eq!(r.status, "error");
}

#[test]
fn parse_response_null_result() {
    let json = r#"{"id":1}"#;
    let r = parse_response(json).unwrap();
    assert_eq!(r.status, "success");
    assert_eq!(r.data, serde_json::Value::Null);
}

#[test]
fn parse_response_raw_value_in_output() {
    let json = r#"{"id":1,"result":{"output":"just a string"}}"#;
    let r = parse_response(json).unwrap();
    assert_eq!(r.status, "success");
    assert_eq!(r.data, serde_json::json!("just a string"));
}

// ── format_exit_status ──────────────────────────────────────────────────

#[cfg(unix)]
#[test]
fn format_exit_status_code_zero() {
    let status = std::process::Command::new("true").status().unwrap();
    assert_eq!(format_exit_status(&status), "exit code 0");
}

#[cfg(unix)]
#[test]
fn format_exit_status_nonzero() {
    let status = std::process::Command::new("false").status().unwrap();
    assert_eq!(format_exit_status(&status), "exit code 1");
}

#[cfg(unix)]
#[test]
fn format_exit_status_signal() {
    use std::os::unix::process::ExitStatusExt;
    let status = std::process::ExitStatus::from_raw(9); // raw 9 → signal 9
    assert_eq!(format_exit_status(&status), "killed by signal 9");
}

// ── session state ───────────────────────────────────────────────────────

#[test]
fn has_session_false_initially() {
    // SESSION is global, but no test calls open(), so this should be false
    assert!(!super::has_session());
}

#[test]
fn close_without_session_is_ok() {
    assert!(super::close().is_ok());
}
