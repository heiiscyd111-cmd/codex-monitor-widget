# Domain Docs

How the engineering skills should consume this repo's domain documentation when exploring the codebase.

## Before exploring, read these

- `CONTEXT.md` at the repo root.
- `docs/adr/` for decisions relevant to the work.

If these files don't exist, proceed silently. Domain-modeling skills create them lazily when terms or decisions are resolved.

## File structure

This repository uses a single-context layout:

```
/
├── CONTEXT.md
├── docs/adr/
├── main.js
└── package.json
```

## Use the glossary's vocabulary

Use terms defined in `CONTEXT.md`. If a required concept is absent, reconsider whether the term belongs or record the gap for domain modeling.

## Flag ADR conflicts

Explicitly identify output that contradicts an existing ADR rather than silently overriding it.
