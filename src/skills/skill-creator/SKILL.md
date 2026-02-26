---
name: skill-creator
description: Guide for creating effective skills. Use this skill when the user wants to create a new skill or update an existing one that extends Cove's capabilities with specialized knowledge, workflows, or tool integrations. 当用户说"创建技能"、"新建一个 skill"、"我想做一个技能"时使用。
emoji: 🛠️
---

# Skill Creator

This skill guides you through creating effective skills for Cove.

## About Skills

Skills are modular, self-contained folders that extend Cove's capabilities with specialized knowledge, workflows, and tools. Think of them as "onboarding guides" for specific domains—they transform Cove from a general-purpose assistant into a specialized agent equipped with procedural knowledge.

### What Skills Provide

1. **Specialized workflows** — Multi-step procedures for specific domains
2. **Tool integrations** — Instructions for working with specific file formats or APIs
3. **Domain expertise** — Company-specific knowledge, schemas, business logic
4. **Bundled resources** — Scripts, references, and assets for complex and repetitive tasks

---

## Core Principles

### Concise is Key

The context window is a shared resource. Skills share it with system prompt, conversation history, and the actual user request.

**Default assumption: the model is already very smart.** Only add context it doesn't already have. Challenge each piece of information: "Does the model really need this?" and "Does this paragraph justify its token cost?"

Prefer concise examples over verbose explanations.

### Set Appropriate Degrees of Freedom

Match specificity to the task's fragility and variability:

- **High freedom (text-based instructions)**: Multiple approaches are valid; decisions depend on context.
- **Medium freedom (pseudocode with parameters)**: A preferred pattern exists; some variation is acceptable.
- **Low freedom (specific scripts, few parameters)**: Operations are fragile; consistency is critical.

### Progressive Disclosure

Skills use a three-level loading system:

1. **Metadata (name + description)** — Always in context (~100 words)
2. **SKILL.md body** — Loaded when the skill triggers (<500 lines)
3. **Bundled resources** — Loaded as needed by the model (no hard limit)

Keep SKILL.md body under 500 lines. Move detailed content into `references/` files and link to them from SKILL.md.

---

## Anatomy of a Skill

```
skill-name/
├── SKILL.md          (required) — frontmatter + instructions
└── Bundled Resources (optional)
    ├── scripts/      — Executable code (Python/Bash/etc.)
    ├── references/   — Documentation loaded into context as needed
    └── assets/       — Files used in output (templates, icons, fonts)
```

### SKILL.md (required)

Every SKILL.md has:

- **Frontmatter** (YAML): `name` and `description` fields.
  - `description` is the primary trigger mechanism — be comprehensive about **what the skill does** and **when to use it**. All "when to use" information goes here (the body is only loaded after triggering).
  - Only use `name` and `description` in frontmatter (plus optional `emoji`).
- **Body** (Markdown): Instructions loaded after the skill triggers.

### Bundled Resources (optional)

#### `scripts/`

Executable code for tasks requiring deterministic reliability or repeated execution.

- **When to include**: Same code is rewritten repeatedly, or deterministic output is needed.
- **Example**: `scripts/rotate_pdf.py` for PDF rotation.
- **Benefit**: Token-efficient; may be executed without loading into context.

#### `references/`

Documentation loaded into context as needed.

- **When to include**: For detailed domain knowledge Cove should reference while working.
- **Examples**: `references/schema.md`, `references/api_docs.md`, `references/policies.md`.
- **Best practice**: Keep SKILL.md lean; move detailed info here. If files are large (>10k words), include grep search patterns in SKILL.md.

#### `assets/`

Files used in output, not loaded into context.

- **When to include**: When the skill needs files for the final output.
- **Examples**: `assets/logo.png`, `assets/template.docx`, `assets/frontend-template/`.

#### What NOT to include

Do not create: `README.md`, `CHANGELOG.md`, `INSTALLATION_GUIDE.md`, or any auxiliary documentation not needed by the model to do the job.

---

## Skill Creation Process

### Step 1: Understand the Skill

Understand concrete usage examples before writing anything. Ask:

- "What problem or scenario does this skill address?"
- "What would a user say to trigger this skill?"
- "Can you give examples of tasks this skill should handle?"

Avoid asking too many questions at once. Start with the most important, follow up as needed.

### Step 2: Plan Reusable Contents

For each concrete example, identify what scripts, references, or assets would help when repeating this workflow.

- Example → code rewritten each time → add a `scripts/` file
- Example → same reference data looked up each time → add a `references/` file
- Example → same template copied each time → add an `assets/` file

### Step 3: Write the SKILL.md

Write the frontmatter `name` and `description` first — the description is the most important part.

**Naming rules:**
- Lowercase letters, digits, and hyphens only (e.g., `plan-mode`, `pdf-editor`)
- Short, verb-led phrases that describe the action
- Under 64 characters

**Body guidelines:**
- Use imperative/infinitive form ("Run X", "Load Y")
- Keep under 500 lines
- Reference bundled resources with relative paths and describe when to load them

### Step 4: Save the Skill

Call the `write_skill` tool with:
- `name`: the skill's slug (e.g., `pdf-editor`)
- `content`: the full SKILL.md content including frontmatter

```
write_skill({ name: "pdf-editor", content: "---\nname: pdf-editor\n..." })
```

The skill will be saved to `~/.cove/skills/{name}/SKILL.md` and immediately enabled.

### Step 5: Iterate

After the user tests the skill, improvements are common. Update via `write_skill` again with the revised content.

---

## Conversation Flow

When this skill is loaded, guide the user through creation conversationally:

1. **Ask** what scenario/problem the skill is for (one question at a time)
2. **Ask** what a user would say to trigger it
3. **Ask** what specific instructions the AI should follow
4. **Optionally ask** if there are reference files, scripts, or assets to bundle
5. **Draft** the SKILL.md and show it to the user for review
6. **Call** `write_skill` to save it once the user approves
