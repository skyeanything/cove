# Bundled Office Naming Map

The bundled `office` tool has two command layers:

## 1. Cove wrapper commands

These control session lifecycle and discovery:

- `help`
- `detect`
- `doctor`
- `list-commands`
- `get-command-schema`
- `open`
- `create`
- `save`
- `close`
- `status`

## 2. OfficeLLM document commands

These are discovered from the runtime itself. Common naming differences:

- `read-document` -> `extract-text`
- `insert-content` -> `insert`
- `convert-markdown` -> `from-markdown`
- `batch edit` -> `execute`

If you are unsure whether a command is a wrapper or a document command:

1. Try `office(command: "help", args: { name: "<command>" })`
2. If it is not a wrapper, use `office(command: "get-command-schema", args: { name: "<command>" })`
