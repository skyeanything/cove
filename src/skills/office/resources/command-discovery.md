# Bundled Office Command Discovery

Use this workflow whenever the bundled `office` tool needs a command you do not know exactly.

1. Run `office(command: "help")` for the built-in discovery overview.
2. Run `office(command: "list-commands")` to see the real runtime command list.
3. If you know the category, narrow it:
   `office(command: "list-commands", args: { category: "Editing" })`
4. Run `office(command: "get-command-schema", args: { name: "<command>" })`
5. Execute the command only after you have checked the schema.

For Cove wrapper commands, inspect them with:

```text
office(command: "help", args: { name: "save" })
```

If execution returns `status: "failure"` or `status: "partial"`, do not treat it as success. Read `code`, `message`, and `errors[*].suggestions` before retrying.
