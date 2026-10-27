# Arch-Nemesis Project Rules & Guidelines

## Purpose
A web app where a user describes a business need in plain words (any domain), returning an interactive architecture diagram and a plain-language explanation.
It serves as a pre-sales tool saving qualified leads for team follow-up; code validates structure and produces numbers, while the LLM designs structure and writes prose.
This repository contains the complete frontend, backend, evaluation suite, and verification tooling for Arch-Nemesis.

## Rules
1. The LLM designs structure and writes prose. Code validates and produces every number.
2. A spec that fails validation is never shown as a finished design.
3. Node types are free text, invented per use case. Never hardcode a list of node types.
4. No effort, cost, price or timeline figures anywhere in v1. If added later: labelled estimates with cited sources, never invented.
5. User text and LLM text are untrusted. Render as plain text. Never use dangerouslySetInnerHTML. Never execute it.
6. Secrets live only in backend env. Never in the browser, never in logs. Never log full prompts or full LLM responses.
7. Never claim a test passed unless it was run and the real output is shown. List everything not run.
8. Never claim legal or regulatory compliance in any output.
9. Every new dependency needs an entry in docs/DECISIONS.md before it is installed.
10. Lead data: store the minimum, keep it out of logs.
11. The walkthrough mentions only nodes, flows and constraints that exist in the validated spec.
12. A change is never applied without the user's Accept. A change that breaks a rule is never applied silently.
13. Model names are never hardcoded. Read them from env, one variable per task.
14. Never read, print, stage or commit .env.
15. Decision log. Every file added, every dependency, every deviation and every non-obvious step is recorded in docs/DECISIONS.md with a plain-English reason (section 6). A phase is not done until its entries exist.

## Protocol
The agent must:
- Inspect the repo and the plan section for this phase.
- Write a plan (files to create, order, tests) and STOP. Wait for my written approval.
- Implement only this phase. No work from later phases, no refactors outside scope, no changes to contracts in section 5 without asking.
- Verify by running the checks. Show real output for every test claimed as passed. Never say "looks good" about something not run.
- Report using exactly these headings: Done, Not done, Not run (and why), Deviations from plan, Risks and open questions.
- Commit only after I confirm my browser checks. Never stage .env.
- Stop and ask (do not decide alone) if: a new dependency is needed, the plan is ambiguous, a contract must change, a test fails twice for the same reason, or an SDK behaviour is unclear.
- Debugging rule: no root-cause claims without a traceback or log. Label guesses as hypotheses.
- Tests rule: the agent writes and runs the tests the phase needs. It skips Playwright and Docker. I do the browser checks listed per phase. Nothing is "fixed" until I confirm it in the browser.
- Prompt style for fixes: one concrete failing example, but fix the failure class and add tests for the class.
- Decision log rule: before every phase commit, the agent adds that phase's entries and summary to docs/DECISIONS.md (section 6) and lists the new entry ids in the report under the heading Decision log entries added. A phase with missing entries is not done. The agent never edits an old entry; it adds a new one that supersedes it.
- Git rule: never run git push, never add or change a git remote, and never create branches or tags unless the user explicitly asks. The user pushes to GitHub themselves.

## Layout
```
arch-nemesis/
  GEMINI.md             (primary rules file read by Antigravity)
  CLAUDE.md             (pointer to GEMINI.md)
  README.md
  .gitignore
  docs/
    BUILD_PLAN.md
    DECISIONS.md
    contracts.md
  scripts/
    dev.ps1
    check.ps1
    llm_smoke.py
  evals/                (Phase 8)
    cases/
    results/
    run.py
    compare.py
  apps/
    api/
      pyproject.toml
      alembic.ini
      .env.example
      alembic/
        versions/
      src/archnemesis/
        main.py
        settings.py
        logging.py
        errors.py
        health.py
        db/
          engine.py
          tables.py
        llm/
          base.py
          gemini.py
          fake.py
          retry.py
        shared/
          brief.py
        prompts/
          *.md
          patterns/*.md
        modules/
          validation/   (pure)
          intake/
          architect/
          explainer/
          leads/
          designs/
          refinement/
      tests/
    web/
      src/
        app/
        components/
        lib/
```

Import rules (enforced by import-linter):
- `validation` imports nothing from the app and none of FastAPI, SQLAlchemy, httpx or an LLM SDK.
- `shared` imports only Pydantic.
- `llm` imports no modules.
- Direction is `designs` imports (`intake`, `architect`, `explainer`, `leads`, `refinement`), and those import (`shared`, `validation`, `llm`, `db`).
- Sibling modules never import each other.
- Any change to these rules needs a decision log entry.

## Commands

### Full Verification
- `powershell scripts/check.ps1` — Runs backend checks (ruff, mypy, import-linter, pytest) and frontend checks (eslint, tsc, vitest).

### Local Development
- `powershell scripts/dev.ps1` — Launches both the FastAPI backend and Next.js frontend in separate PowerShell windows.
- Backend alone: `cd apps/api && uv run uvicorn archnemesis.main:create_app --factory --reload --port 8000`
- Frontend alone: `cd apps/web && npm run dev`

### Backend Testing & Tooling
- `cd apps/api && uv run pytest -q` — Run backend pytest test suite.
- `cd apps/api && uv run ruff check` — Run backend linter.
- `cd apps/api && uv run ruff format --check` — Run backend formatter check.
- `cd apps/api && uv run mypy src tests` — Run backend type checker.
- `cd apps/api && uv run lint-imports` — Check architectural layer boundaries.
- `cd apps/api && uv run alembic upgrade head` — Run database migrations.

### Frontend Testing & Tooling
- `cd apps/web && npm test` — Run Vitest suite.
- `cd apps/web && npm run lint` — Run ESLint.
- `cd apps/web && npx tsc --noEmit` — Run TypeScript compiler type-check.

### Manual Verification
- `uv run python scripts/llm_smoke.py` — Run live Gemini smoke test (manual developer test; requires backend .env).

## Where decisions live
- All architectural, implementation, dependency, and process decisions live in [docs/DECISIONS.md](docs/DECISIONS.md).
- All core data contracts, limits, and validation rules live in [docs/contracts.md](docs/contracts.md).
- Antigravity automatically discovers and enforces [GEMINI.md](GEMINI.md). [CLAUDE.md](CLAUDE.md) acts as a pointer to GEMINI.md for cross-tool reference.

