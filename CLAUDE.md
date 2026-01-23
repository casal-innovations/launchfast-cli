# CLAUDE.md

This repository is part of the **LaunchFast system**.

---

## Canonical Authority

The authoritative LaunchFast doctrine lives at:

```
../CLAUDE.md
```

That file defines:

- correctness doctrine
- entropy constraints
- authority model
- cross‑repo law

---

## Workflow Requirements

- Always run tests (`npm test`) before committing changes.

## Repository Operating Principles (Non-Negotiable)

These principles govern **all human and AI contributions** to this repository.
They are constraints, not advice. If a proposed change conflicts with any of
these, the change must be redesigned or rejected.

- **TypeScript-first repository**
  All local tooling and automation must be implemented in TypeScript + Node.js.
  Shell scripts (`.sh`) are disallowed in this repository.

- **Systems over discipline**
  Repeated decisions indicate a system failure. Prefer constraints, shared
  utilities, and defaults over documentation or "remember to" instructions.

- **Single source of truth**
  Logic must not be duplicated across languages or layers. If logic exists in
  TypeScript, other tooling must import and reuse it rather than reimplement it.

- **Tooling is infrastructure**
  Scripts, dev tooling, and automation are production-grade infrastructure, not
  helpers. They require the same rigor as application code.

- **Stop on ambiguity**
  If requirements, intent, or correctness are unclear, STOP and ask before
  proceeding. Guessing is considered a failure mode.
