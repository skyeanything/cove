---
description: KISS development principle — all code agents must follow
---

# KISS

Keep It Simple and Stupid. This is the default engineering principle for all work in this repository.

## Core Rules

1. **Solve the stated problem. Nothing more.** Do not add features, options, or abstractions that were not requested. A task that asks for a bug fix gets a bug fix, not a refactored module.

2. **Smallest viable change.** Measure your diff. If you can achieve the same result with fewer lines changed, do that instead. Fewer lines = fewer bugs = easier review.

3. **No premature abstraction.** Three similar blocks of code are fine. Do not extract a helper, utility, or base class until there is a fourth instance and a proven need. The wrong abstraction is worse than duplication.

4. **No speculative generality.** Do not design for hypothetical future requirements. Do not add configuration for things that have exactly one value. Do not create interfaces with a single implementation. Build for what exists now.

5. **Flat over nested.** Prefer flat control flow. Early returns over deep nesting. Direct calls over indirection layers. If adding a layer of abstraction does not remove complexity, it adds complexity.

6. **Delete, don't wrap.** When something is no longer needed, remove it. Do not comment it out, wrap it in a feature flag, or hide it behind a compatibility shim. Dead code is a liability.

7. **Obvious over clever.** If a reviewer needs to pause and think about what your code does, simplify it. Readability is not a nice-to-have; it is a requirement.

## Applied to Common Decisions

| Situation | Do | Do not |
|-----------|-----|--------|
| One-off string transformation | Inline the logic | Create a `StringUtils` class |
| Error that cannot happen in practice | Let it crash (or assert) | Add try/catch with logging and fallback |
| Function used in one place | Keep it where it is used | Move it to a shared utils file |
| Config value that never changes | Hardcode it | Read it from env/config/database |
| Adding a dependency | Check if stdlib or existing deps cover it | Pull in a new package for one function |
| Test for a trivial getter | Skip it | Write it for coverage numbers |

## Conflict

If a task explicitly requires extensibility, configurability, or forward-looking design, follow the task requirements. These defaults apply when no such requirement exists.
