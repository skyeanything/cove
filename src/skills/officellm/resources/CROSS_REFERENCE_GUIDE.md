# AI Agent Guide: Cross-References

This guide provides strategies for AI agents to use cross-referencing effectively.

## Quick Command Reference

| Command | Key Parameter | Use Case |
|---------|---------------|----------|
| `insert-caption` | `--label` | Tag a figure/table for later use. |
| `insert-ref` | `--ref` | Point to a previously tagged label. |
| `list-captions` | - | Sync your internal model with the doc's labels. |
| `update-fields` | - | Finalize document before delivery. |

## Strategy for Agents

### 1. Labeling Convention
Use a consistent prefix for labels to keep them organized:
- `fig:` for Figures (e.g., `fig:results`)
- `tab:` for Tables (e.g., `tab:stats`)
- `eq:` for Equations (e.g., `eq:entropy`)

### 2. The Anchor Pattern
When inserting captions or references, always choose an anchor text that is unique and immediately precedes where the new element should go.

**Example**:
If you see "Figure 1 shows the data.", and you want to insert a reference after "See", anchor on "See ".

### 3. Label Normalization
All labels are normalized to alphanumeric characters and underscores (e.g., `fig:test` → `fig_test`). Be aware that different input labels might collide if they normalize to the same string.

### 4. Native Compatibility
`list-captions` can identify captions created by humans in Word. These usually have bookmark names like `_Ref123456789`. You can reference these native captions just like your own labels.

### 5. Cascade Deletion
When removing a figure/table paragraph, **always** use `remove-caption --cascade` if you set a label for it. This prevents "Error! Reference source not found." messages in the final Word document.

## Common Error Scenarios

- **Label already exists**: Choose a more specific label (e.g., add a suffix).
- **Label not found**: Use `list-captions` to verify the exact spelling of labels in the document.
- **Number shows as "0"**: This is normal during CLI processing. Use `update-fields` and reassure the user that Word will refresh the numbers on open.
