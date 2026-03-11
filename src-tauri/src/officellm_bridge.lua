-- OfficeLLM Lua Bridge
-- Bridges officellm.open()/doc.call()/doc.save()/doc.close() to workspace.officellm()

local function camel_to_kebab(s)
    return s:gsub("%u", function(c) return "-" .. c:lower() end)
end

local function camel_to_snake(s)
    return s:gsub("%u", function(c) return "_" .. c:lower() end)
end

-- Convert camelCase Lua params to kebab-case CLI params.
-- boolean true  -> empty string (bare flag, e.g. --dry-run)
-- boolean false -> omitted entirely
-- nil           -> omitted
-- everything else -> tostring(value)
local function convert_params(params)
    local out = {}
    for key, val in pairs(params) do
        local k = camel_to_kebab(key)
        if type(val) == "boolean" then
            if val then out[k] = "" end
        elseif val ~= nil then
            out[k] = tostring(val)
        end
    end
    return out
end

-- Call workspace.officellm() and parse the JSON result.
local function invoke(cmd, params)
    local raw = workspace.officellm(cmd, params or {})
    local ok, result = pcall(json.decode, raw)
    if ok then return result else return raw end
end

local function create_session()
    return {
        call = function(command, params)
            return invoke(command, convert_params(params or {}))
        end,

        execute = function(ops, options)
            local batch = { version = "1.0", ops = ops }
            if options then
                for k, v in pairs(options) do
                    batch[camel_to_snake(k)] = v
                end
            end
            return invoke("execute", { ["instructions-json"] = json.encode(batch) })
        end,

        save = function(path)
            if path then
                return invoke("save", { path = path })
            else
                return invoke("save", {})
            end
        end,

        close = function()
            return invoke("close", {})
        end,
    }
end

officellm = {
    open = function(path)
        invoke("open", { path = path })
        return create_session()
    end,

    create = function(params)
        invoke("create", convert_params(params or {}))
        return create_session()
    end,

    call = function(command, params)
        return invoke(command, convert_params(params or {}))
    end,
}
