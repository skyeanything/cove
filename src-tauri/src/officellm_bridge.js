// OfficeLLM QuickJS Bridge
// Bridges officellm.open()/doc.call()/doc.save()/doc.close() to workspace.officellm()
// See ~/.officellm/skills/resources/QUICKJS_API_GUIDE.md for the full spec.

var officellm = (function() {
  function camelToKebab(s) {
    return s.replace(/[A-Z]/g, function(c) { return "-" + c.toLowerCase(); });
  }

  function camelToSnake(s) {
    return s.replace(/[A-Z]/g, function(c) { return "_" + c.toLowerCase(); });
  }

  // Convert camelCase JS params to kebab-case CLI params.
  // boolean true  -> empty string (bare flag, e.g. --dry-run)
  // boolean false -> omitted entirely
  // null/undefined -> omitted
  // everything else -> String(value)
  function convertParams(params) {
    var out = {};
    for (var key in params) {
      if (!params.hasOwnProperty(key)) continue;
      var val = params[key];
      var k = camelToKebab(key);
      if (typeof val === "boolean") {
        if (val) out[k] = "";
      } else if (val != null) {
        out[k] = String(val);
      }
    }
    return out;
  }

  // Call workspace.officellm() and parse the JSON result.
  function invoke(cmd, params) {
    var raw = workspace.officellm(cmd, params || {});
    try { return JSON.parse(raw); } catch (e) { return raw; }
  }

  function createSession() {
    return {
      call: function(command, params) {
        return invoke(command, convertParams(params || {}));
      },

      execute: function(ops, options) {
        var batch = { version: "1.0", ops: ops };
        if (options) {
          for (var k in options) {
            if (options.hasOwnProperty(k)) {
              batch[camelToSnake(k)] = options[k];
            }
          }
        }
        return invoke("execute", { "instructions-json": JSON.stringify(batch) });
      },

      save: function(path) {
        return invoke("save", path ? { path: path } : {});
      },

      close: function() {
        return invoke("close", {});
      }
    };
  }

  return {
    open: function(path) {
      invoke("open", { path: path });
      return createSession();
    },
    create: function(params) {
      invoke("create", convertParams(params || {}));
      return createSession();
    },
    call: function(command, params) {
      return invoke(command, convertParams(params || {}));
    }
  };
})();
