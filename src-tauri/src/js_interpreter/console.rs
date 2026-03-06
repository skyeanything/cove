use rquickjs::Function;
use std::cell::RefCell;
use std::rc::Rc;

pub(super) fn register_console_fn<'js>(
    ctx: &rquickjs::Ctx<'js>,
    console: &rquickjs::Object<'js>,
    name: &str,
    buf: Rc<RefCell<Vec<String>>>,
    prefix: &'static str,
) -> Result<(), String> {
    let f = Function::new(
        ctx.clone(),
        move |args: rquickjs::function::Rest<rquickjs::Value>| {
            let parts: Vec<String> = args
                .0
                .iter()
                .map(|v| {
                    v.as_string()
                        .and_then(|s| s.to_string().ok())
                        .unwrap_or_else(|| format!("{v:?}"))
                })
                .collect();
            let line = if prefix.is_empty() {
                parts.join(" ")
            } else {
                format!("{prefix}{}", parts.join(" "))
            };
            buf.borrow_mut().push(line);
        },
    )
    .map_err(|e| format!("{e}"))?;
    console.set(name, f).map_err(|e| format!("{e}"))
}

pub(super) fn stringify_value(val: &rquickjs::Value) -> String {
    val.as_string()
        .and_then(|s| s.to_string().ok())
        .unwrap_or_else(|| {
            if val.is_undefined() || val.is_null() {
                "undefined".to_string()
            } else {
                format!("{val:?}")
            }
        })
}
