# Arch-Nemesis: Build Plan for Antigravity

Written October 26, 2026. Companion to planning docs 1 and 2. Where this plan and an older doc disagree, this plan wins.

## 1. What we are building

A web app where a user describes a business need in plain words (any domain). It returns:

1. An interactive architecture diagram (clickable nodes).
2. A plain-language explanation of that diagram.
It is a pre-sales tool. A "Contact our team" button saves a lead; our team prepares a basic POC by hand. The app itself produces no POC, no cost, no effort and no timeline figures.

**Core principle: the LLM designs structure and writes prose. Deterministic code validates the design and produces every number.**

**v1 core = Phases 0 to 6.** Refinement chat = Phase 7 (v1.1). Hardening = Phase 8.

**Out of scope:** POC automation, cost or timeline figures, user accounts, generated starter code, payments, hosting, Docker, embeddings, vector DB, Playwright, and any hardware sizing or ModelFit integration (a separate project, planned only after v1 works).

## 2. Rules (copy verbatim into CLAUDE.md in Phase 0)

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
**15. Decision log.** Every file added, every dependency, every deviation and every non-obvious step is recorded in docs/DECISIONS.md with a plain-English reason (section 6). A phase is not done until its entries exist.

## 3. Working protocol (applies to every phase)

The agent must:

1. **Inspect** the repo and the plan section for this phase.
2. **Write a plan** (files to create, order, tests) and **STOP**. Wait for my written approval.
3. **Implement only this phase.** No work from later phases, no refactors outside scope, no changes to contracts in section 5 without asking.
4. **Verify** by running the checks. Show real output for every test claimed as passed. Never say "looks good" about something not run.
5. **Report** using exactly these headings: Done, Not done, Not run (and why), Deviations from plan, Risks and open questions.
6. Commit only after I confirm my browser checks. Never stage .env.
**Stop and ask** (do not decide alone) if: a new dependency is needed, the plan is ambiguous, a contract must change, a test fails twice for the same reason, or an SDK behaviour is unclear.

**Debugging rule:** no root-cause claims without a traceback or log. Label guesses as hypotheses.

**Tests rule:** the agent writes and runs the tests the phase needs. It skips Playwright and Docker. I do the browser checks listed per phase. Nothing is "fixed" until I confirm it in the browser.

**Prompt style for fixes:** one concrete failing example, but fix the failure class and add tests for the class.

**Decision log rule:** before every phase commit, the agent adds that phase's entries and summary to docs/DECISIONS.md (section 6) and lists the new entry ids in the report under the heading Decision log entries added. A phase with missing entries is not done. The agent never edits an old entry; it adds a new one that supersedes it.

## 4. Stack and layout

**Environment:** Windows, PowerShell, no Docker, no make. Scripts live in scripts/*.ps1.

**Backend (apps/api):** Python 3.12+, uv, FastAPI, Pydantic v2, pydantic-settings, SQLite via SQLAlchemy async (aiosqlite), Alembic, networkx, structlog, pytest, pytest-asyncio, hypothesis, respx, ruff, mypy strict, import-linter.

**Frontend (apps/web):** Next.js App Router, TypeScript strict, Tailwind, shadcn/ui, @xyflow/react with dagre, TanStack Query, React Hook Form with Zod, Vitest, npm.

**LLM:** Google Gemini via google-genai, behind an LLMClient protocol. Env vars: LLM_MODEL_INTAKE, LLM_MODEL_ARCHITECT, LLM_MODEL_WRITER. Start with the same free-tier model for all three; upgrade only ARCHITECT later. Current model names, limits and JSON-schema output must be verified from official docs and the installed SDK source (TODO(verify)). The agent never picks or changes a model name; I set the three variables in .env myself.

**Run (two terminals):**

- T1: cd apps\api ; uv run uvicorn archnemesis.main:app --reload --port 8000
- T2: cd apps\web ; npm run dev
- Next.js rewrites /api/* to port 8000.
**Layout:**

```
arch-nemesis/
  CLAUDE.md  README.md  .gitignore
  docs/      DECISIONS.md  contracts.md
  scripts/   dev.ps1  check.ps1  llm_smoke.py
  evals/     cases/  results/  run.py  compare.py   (Phase 8)
  apps/api/
    pyproject.toml  alembic.ini  .env.example  alembic/versions/
    src/archnemesis/
      main.py  settings.py  logging.py  errors.py  health.py
      db/        engine.py  tables.py
      llm/       base.py  gemini.py  fake.py  retry.py
      shared/    brief.py
      prompts/   *.md  patterns/*.md
      modules/
        validation/   (pure)
        intake/  architect/  explainer/  leads/  designs/  refinement/
    tests/
  apps/web/
    src/app/  src/components/  src/lib/
```

**Import rules (enforced by import-linter):** validation imports nothing from the app and none of FastAPI, SQLAlchemy, httpx or an LLM SDK. shared imports only Pydantic. llm imports no modules. Direction is designs imports (intake, architect, explainer, leads, refinement), and those import (shared, validation, llm, db). Sibling modules never import each other. Any change to these rules needs a decision log entry.

## 5. Data contracts

These are the load-bearing decisions. Changing them later means rewriting validation, prompts and the UI.

**RequirementBrief** (module intake)

- summary, users, data_involved (list), domain_hint (free text).
- stated_constraints: list of {id, text}. Each is something the user said must hold (for example "answers must never expose personal data").
- unverifiable_requirements: list of text. Things the user wants that code cannot check. Shown to the user honestly as "not verified by checks".
- numbers_given: list of {label, value, unit}. The only numbers the explanation may repeat.
- assumptions: list of text (filled when the follow-up cap is hit).
**ArchitectureSpec** (module validation, pure Pydantic)

- nodes: {id, name, type, role, inputs[], outputs[], tech_options[] (optional), needs_model (bool)}. id matches ^[a-z][a-z0-9_]{1,40}$. name max 60, type max 40 (free text), role max 300, each input or output max 120 (data labels describing what the part consumes or emits, not node IDs; connectivity comes only from edges), max 8 each, max 5 tech_options.
- edges: {from, to, flows}. flows max 200. No self-loops, no duplicate (from, to).
- constraints: {id, text, kind, node_id (optional), a (optional), b (optional), covers[]}. covers lists the brief constraint ids this one satisfies.
- entry_ids[], exit_ids[].
- Limits (configurable constants): more than 15 nodes or 40 edges is an error (E_NODE_LIMIT, E_EDGE_LIMIT); fewer than 3 nodes is only a warning (W_TOO_FEW_NODES).
- **v1 specs are acyclic (DAG).** Feedback loops are described in a node's role, not drawn. Record as an ADR.
**Constraint kinds (closed set, nothing else is accepted):**

| kind | params | passes when |
| --- | --- | --- |
| must_exist | node_id | the node exists |
| must_pass_through | node_id | removing the node leaves no path from any entry to any exit |
| must_not_connect | a, b | there is no path from a to b |
| must_precede | a, b | with a removed, b is unreachable from every entry |

A user requirement that fits no kind goes to unverifiable_requirements. It is never turned into a constraint that code cannot check.

**Validation error codes (blocking):** E_SCHEMA, E_DUP_ID, E_BAD_REF, E_NO_ENTRY, E_NO_EXIT, E_ORPHAN, E_UNREACHABLE_FROM_ENTRY, E_CANNOT_REACH_EXIT, E_CYCLE, E_SELF_LOOP, E_DUP_EDGE, E_NODE_LIMIT, E_EDGE_LIMIT, E_UNKNOWN_CONSTRAINT_KIND, E_CONSTRAINT_BAD_PARAM, E_CONSTRAINT_VIOLATED, E_BRIEF_CONSTRAINT_UNCOVERED. Each error carries a code, a plain message and the ids involved.

**Lints (warnings, never block):** W_MODEL_NODE_NO_INPUTS, W_NODE_NO_OUTPUTS, W_TOO_FEW_NODES, W_DUP_NODE_NAME. Shown as "Notes".

**Stored per design version:** brief_json, spec_json, explanation_json, prompt_version, model names used, warnings, created_at, version_no, change_note. Versions are immutable. A lead points to an exact version.

**LLM error codes:** LLM_UNAVAILABLE (503), LLM_RATE_LIMITED (429), LLM_TIMEOUT, LLM_BAD_OUTPUT. Each maps to a friendly user message. Retry only on 503, 429 and timeout: up to 3 attempts with backoff. Schema failures are handled only by the repair loop.

## 6. The decision log (docs/DECISIONS.md)

This file is how I (a learner) understand the project. The agent writes it and I read it after every phase. It explains **why**, not only what. A phase is not done until its entries exist.

**Required headings, created in Phase 0:**

1. # How to read this file: what an entry contains and what each label means.
2. ## Glossary: plain meaning of every technical term the first time it is used (for example FastAPI, Pydantic, DAG, migration, repair loop, import-linter). Two sentences at most per term. No term may be defined using another undefined term.
3. ## File map: every file and folder the project creates, grouped by folder: path, what it is, why it exists, which phase created it. Generated folders (.venv, node_modules, .next, lockfiles) are listed once as a group.
4. ## Phase summaries: after each phase add what it added, how the pieces connect now (5 to 10 lines; a simple text flow such as browser > Next.js > /api > FastAPI > LLM client is welcome), three things I can try myself (a command or a URL), and what is still missing.
5. ## Decisions: the entries below.
**Entry format (copy exactly):**

```
### D-007 · Phase 1 · dependency
What: one sentence.
Why: two to five plain sentences, written for a beginner.
Alternatives considered: at least one real alternative and why it was not chosen.
If we removed it: what would break or get worse.
Decided by: plan | agent proposed, user approved | agent alone (tiny choices only, flagged)
Status: active | superseded by D-0xx
```

Labels: file, dependency, step, design, deviation, fix.

**Rules for the log:**

1. One entry per dependency, per deviation from this plan, per non-obvious step, and per group of related files. Trivial files may share an entry.
2. Write an entry when the decision is made. Finalise it before the phase commit.
3. Never edit an old entry. To change a decision, add a new entry and mark the old one superseded.
4. Never write that something was tested unless the phase report shows the real output. Point to the report heading instead.
5. A deviation from this plan needs my approval first. It is labelled deviation here and listed in the phase report.
6. Plain English. Every technical term used appears in the Glossary.
7. Phase 0 creates D-001 to D-013 from the seeds below, using these reasons.
**Seed entries (the reasons come from this plan):**

| ID | Decision | Reason to record |
| --- | --- | --- |
| D-001 | New repo, separate from ModelFit | Clean start. ModelFit stays untouched on its own branch. |
| D-002 | SQLite | No install, one file, enough for one machine. Postgres only if hosting needs it later. |
| D-003 | No Docker | Simpler on my Windows machine. Deployment is decided later. |
| D-004 | Gemini behind an LLMClient protocol | Models can change without touching app code. Tests use a fake client and spend no quota. |
| D-005 | Pure validation module | The checks must not depend on the LLM or the web, so they can be trusted and tested alone. |
| D-006 | Acyclic specs (DAG) in v1 | Paths from entry to exit are then well defined and checkable. Loops are described in a node's role. |
| D-007 | Closed set of constraint kinds | Code can only verify rules it understands. Anything else is listed honestly as unverifiable. |
| D-008 | No cost, effort or timeline figures | The app must not invent numbers. Our team prepares them after contact. |
| D-009 | Leads saved only; the basic POC is made by hand | Keeps v1 small and builds trust through a real conversation. |
| D-010 | dagre for diagram layout | Simple, predictable left-to-right layout. elkjs is heavier and not needed yet. |
| D-011 | Restoring a version creates a new version | History is never rewritten, so every lead and every diff stays valid. |
| D-012 | One model variable per task | I can upgrade only the architect model later without touching code. |
| D-013 | ModelFit is out of scope | It is a separate project, integrated only after v1 works, with its own plan. |

## 7. Phases

Every phase has the same parts. **Already decided** means the agent follows it and does not choose differently. **Ask me first** lists the choices that are mine: the agent stops, gives its recommendation with the reason, and waits. Anything that is in neither place is also a question for me, never a silent choice. Every phase also follows section 3 (protocol) and section 6 (decision log).

**Limits and defaults.** They live only in settings.py as environment-overridable settings, never as numbers inside other code:

| Setting | Default | Used for |
| --- | --- | --- |
| MAX_NODES | 15 | Largest allowed design |
| MAX_EDGES | 40 | Largest allowed design |
| MAX_INPUT_CHARS | 4000 | One user message in intake |
| MAX_FOLLOWUP_ROUNDS | 3 | Intake questions before it must proceed |
| MAX_REPAIR_ATTEMPTS | 2 | Generator repairs after the first try |
| LLM_MAX_ATTEMPTS | 3 | Tries per LLM call on 503, 429 or timeout |
| LLM_TIMEOUT_SECONDS | 60 | One LLM call, converted to the SDK's unit |
| LEAD_NOTE_MAX_CHARS | 500 | Optional note on the contact form |
| MAX_PATCH_OPS | 20 | Operations in one change proposal |
| MAX_REFINEMENT_TURNS | 20 | User messages per design |
| MAX_VERSIONS | 15 | Versions per design |

### Phase 0: Constitution (no code)

**Goal:** a clean repo where every rule and decision is written down before any code exists.

**Already decided:**

- Repo name arch-nemesis, default branch main, created as a new folder next to (never inside) E:\CanItRunAI.
- Backend settings file is apps/api/.env; its template is apps/api/.env.example. The web app needs no env file in v1.
- All planning documents are written in English.
**Ask me first:**

1. The full folder path where the new repo goes.
2. Which rules file Antigravity reads (CLAUDE.md or another name). The agent checks Antigravity's official docs, reports what it found, and I approve. It must not guess.
3. Whether git config user.name and user.email are already set. The agent only reports this; it never sets them.
**Build (exactly this):**

1. git init, branch main.
2. Folders with an empty .gitkeep: apps/api, apps/web, docs, scripts, evals.
3. CLAUDE.md at the root with these sections in this order: Purpose (3 lines), Rules (section 2 of this plan, verbatim, all 15), Protocol (section 3, verbatim), Layout (section 4 layout), Commands (an empty heading, filled in Phase 1), Where decisions live (points to docs/DECISIONS.md and docs/contracts.md). If Antigravity needs a different rules file name, add that file as a short pointer to CLAUDE.md.
4. docs/contracts.md: section 5 of this plan verbatim, plus the limits table above.
5. docs/DECISIONS.md with the five headings from section 6, a starting Glossary (git, repo, branch, commit, LLM, API, schema, validation, decision log), a File map for the files created in this phase, entries D-001 to D-013 from the seeds, and the Phase 0 summary.
6. .gitignore containing at least: .env, .env.*, !.env.example, *.db, *.db-journal, *.sqlite, .venv/, __pycache__/, .pytest_cache/, .mypy_cache/, .ruff_cache/, node_modules/, .next/, coverage/, *.log.
7. apps/api/.env.example with variable names only: GEMINI_API_KEY=, LLM_MODEL_INTAKE=, LLM_MODEL_ARCHITECT=, LLM_MODEL_WRITER=, DATABASE_URL=sqlite+aiosqlite:///./arch_nemesis.db, ADMIN_TOKEN=, LOG_LEVEL=INFO, with a comment line saying never to put real values in this file.
8. README.md: what the project is (3 lines), prerequisites (Python 3.12 or newer, uv, Node; the agent checks the current Next.js requirement in its official docs and records the version), the two run commands marked as target, working from Phase 1.
**Do not:** write application code, install anything, create a .env, touch E:\CanItRunAI, or copy anything from it.

**Decision log entries required:** D-001 to D-013, plus one file entry per file group created.

**Done when (real output shown):** git status is clean; git log --oneline; git ls-files (must not list any .env); Get-Content CLAUDE.md | Select-String '^## ' shows the section headings in order.

**My browser checks:** none. I read CLAUDE.md against section 2 (all 15 rules present, word for word) and read DECISIONS.md. I run git ls-files myself.

**Commit message:** phase 0: constitution and decision log

### Phase 1: Foundation

**Goal:** a running backend and frontend skeleton, a health check, the LLM client with a fake for tests, and all the quality tooling. No product features.

**Already decided:**

- Only install a package when this phase uses it. Install now (backend): fastapi, uvicorn[standard], pydantic, pydantic-settings, sqlalchemy[asyncio], aiosqlite, alembic, structlog, google-genai. Dev: pytest, pytest-asyncio, httpx (test client), respx, ruff, mypy, import-linter. Not now: networkx and hypothesis (Phase 2), email-validator (Phase 6).
- Package layout is src/archnemesis inside apps/api, Python 3.12 or newer, managed with uv.
- The app starts without a Gemini key. Missing key or model name is an error only when an LLM call is made (LLM_NOT_CONFIGURED).
- No CORS setup: the browser only talks to Next.js, which forwards /api/* to the backend.
- SQLite connections turn on PRAGMA foreign_keys=ON.
- The LLM client has two methods, defined below. generate_json returns a plain dict and never validates against our models; each caller validates for itself (the generator needs the raw failure to run its repair loop).
**Ask me first:**

1. Anything the Gemini SDK source contradicts in this section (timeout unit, JSON output option, error classes).
2. Any package name or version choice that is not obvious (for example the maintained npm package for dagre in Phase 4).
**Build, backend (apps/api):**

1. settings.py: Settings(BaseSettings) reading .env, extra='ignore'. Fields: gemini_api_key: SecretStr | None, llm_model_intake, llm_model_architect, llm_model_writer (all str | None), database_url: str, admin_token: SecretStr | None, log_level: str, plus every limit in the table above with its default. get_settings() is cached.
2. logging.py: structlog configured once. A redaction processor replaces the value with [redacted] for any key (case-insensitive, nested dicts and lists included) named: email, name, note, api_key, authorization, token, password, prompt, message, text, system, user. Each request gets a request_id. Never log request or response bodies. For unhandled errors log only the exception class and the first 200 characters of its message; full tracebacks only when LOG_LEVEL=DEBUG.
3. errors.py: AppError(code, message, status) and one handler that always returns {"error": {"code": "...", "message": "..."}}. Codes for now:
| Code | HTTP | Message shown to the user |
| --- | --- | --- |
| LLM_UNAVAILABLE | 503 | The AI service is busy right now. Please try again in a minute. |
| LLM_RATE_LIMITED | 429 | The AI service is limiting requests. Please wait a minute and try again. |
| LLM_TIMEOUT | 504 | The AI service took too long to answer. Please try again. |
| LLM_BAD_OUTPUT | 502 | The AI returned an answer we could not use. Please try again. |
| LLM_NOT_CONFIGURED | 503 | The AI service is not set up on this server. |
| INPUT_INVALID | 422 | A specific message that names the field and the rule. |
| NOT_FOUND | 404 | We could not find that. |
| INTERNAL_ERROR | 500 | Something went wrong on our side. |

1. db/engine.py: async engine from database_url (default sqlite+aiosqlite:///./arch_nemesis.db), a session factory, and a get_session dependency. db/tables.py is created empty with a comment. Alembic is initialised for async use with one baseline revision 0001_baseline that creates nothing, so later migrations chain from it.
2. llm/base.py:
```
class LLMTask(StrEnum): INTAKE='intake'; ARCHITECT='architect'; WRITER='writer'
class LLMClient(Protocol):
    async def generate_text(self, task: LLMTask, system: str, user: str) -> str: ...
    async def generate_json(self, task: LLMTask, system: str, user: str, schema: type[BaseModel]) -> dict[str, Any]: ...
```

The exceptions are LLMUnavailable, LLMRateLimited, LLMTimeout, LLMBadOutput and LLMNotConfigured, each mapped to the error code of the same name above. schema is passed to the SDK as the requested output shape. generate_json raises LLMBadOutput only if the reply is not a JSON object.

1. llm/retry.py: retry_async with LLM_MAX_ATTEMPTS tries, delays 1.0 s then 2.0 s (factor 2) with up to 20 percent random jitter, retrying only LLMUnavailable, LLMRateLimited and LLMTimeout. The sleep function is injectable so tests do not wait.
2. llm/gemini.py: GeminiClient. Before writing it, the agent reads the installed google-genai source and records in the decision log: the timeout unit (expected milliseconds), how to request JSON output with a schema, which JSON-schema features Gemini accepts (free-form dict fields, unions, optional fields), and which exception classes mean 503, 429 and timeout. The model name for a task always comes from settings. Read ModelFit's client at E:\CanItRunAI read-only for ideas; adapt it, never import it.
3. llm/fake.py: FakeLLMClient(script) where each script item is a string, a dict, or an Exception to raise. It returns items in order, records every call (task, system, user) for assertions, and raises FakeScriptExhausted if called more often than scripted.
4. health.py: GET /api/health returns {"status": "ok", "llm_configured": true|false, "database": "ok"|"error"} with HTTP 200 even if the database check (SELECT 1) fails; then status is degraded. It never returns the key or model names.
5. main.py: create_app() factory and app = create_app(); registers the health router and the error handler.
6. import-linter contracts from section 4 in pyproject.toml. ruff and mypy (strict) configured. pytest-asyncio in auto mode.
**Build, frontend (apps/web):**

1. create-next-app with TypeScript, ESLint, Tailwind, App Router, src/ directory, import alias @/*; defaults for everything else. List every choice made in the decision log.
2. In tsconfig.json: strict: true and noUncheckedIndexedAccess: true.
3. shadcn/ui init with the neutral base colour; add only button and card.
4. next.config: rewrite /api/:path* to http://127.0.0.1:8000/api/:path* (use 127.0.0.1, not localhost, to avoid IPv6 name resolution trouble on Windows).
5. TanStack Query with a Providers component. Home page shows a card: the text API healthy, or the text API not reachable, based on /api/health.
6. Vitest configured, with one test for the health card.
**Build, scripts:**

- scripts/dev.ps1: starts the backend and the frontend in two new PowerShell windows and prints the two manual commands.
- scripts/check.ps1: runs, in order, uv run ruff check, uv run mypy, uv run lint-imports, uv run pytest -q (inside apps\api), then npm run lint, npx tsc --noEmit, npm test (inside apps\web). It prints PASS or FAIL per step and exits non-zero on any failure.
- scripts/llm_smoke.py: one real generate_text call asking for the single word OK. It prints only OK or the error code, and the reply length. Never the key, prompt or reply. I run it myself: cd apps\api ; uv run python ..\..\scripts\llm_smoke.py.
- Fill the Commands section of CLAUDE.md.
**Tests (names are suggestions; coverage is not):** settings defaults and masked secrets; redaction of every listed key including nested and mixed case; health with and without LLM configured; error envelope shape for each code; fake client returns items in order, raises a scripted error, raises when exhausted; retry retries only the three retryable errors, gives up after the maximum and re-raises the last one, uses the expected delays; timeout seconds convert to the SDK's unit; Gemini errors map to the right codes (mock at the narrowest layer the SDK allows and say which); import-linter passes.

**Do not:** build any product feature, call the real Gemini API inside any test, hardcode a model name, or choose a model.

**Decision log entries required:** one per dependency group, one for each of the eight Gemini facts recorded above, one for the app-starts-without-a-key rule, one for generate_json returning a dict, one for the 127.0.0.1 rewrite, and file entries for each folder.

**Done when (real output shown):** the full output of scripts\check.ps1; the list of tests that were not run and why.

**My browser checks:** open http://localhost:3000, the page shows API healthy. Stop the backend, refresh, it shows API not reachable and no crash. I create apps/api/.env myself, set the three model variables and the key, and run llm_smoke.py.

**Commit message:** phase 1: foundation

### Phase 2: ArchitectureSpec and pure validation

**Goal:** the models and the code that decide whether a design is acceptable. No LLM, no database, no web.

**Already decided:**

- Everything lives in modules/validation/: models.py, graph.py, checks.py, constraints.py, lints.py, ordering.py, validate.py, and an __init__.py that exports only the public names below.
- Public API: validate(spec, brief_constraints: dict[str, str], limits: Limits) -> ValidationResult; parse_and_validate(raw: dict, brief_constraints, limits) -> tuple[ArchitectureSpec | None, ValidationResult]; order_nodes(spec) -> list[str]; Limits (a frozen dataclass with max_nodes and max_edges). brief_constraints maps a brief constraint id to its text. Limits are passed in, so this module never reads settings.
- Models are Pydantic v2 with extra='ignore'. Field limits and the id pattern are exactly as in section 5. kind is a plain str (not an enum) so an unknown kind produces E_UNKNOWN_CONSTRAINT_KIND instead of a generic schema error. node_id, a and b on a constraint are optional strings; which of them a kind needs is checked in constraints.py, not in the model.
- ValidationIssue has code, severity (error or warning), message, ids (list of strings). ValidationResult has errors, warnings, skipped (a list of check names that did not run and why) and a property ok (true when there are no errors). Issues are sorted by (code, ids) so output is deterministic.
- The graph is built with networkx using nodes and edges sorted by id, so witness paths are identical on every run.
- Order of checks: (1) schema, only in parse_and_validate, reported as E_SCHEMA with at most 10 details; (2) duplicate ids; (3) references; (4) limits; (5) graph structure; (6) constraints; (7) coverage; (8) lints. Step 5 is skipped if steps 2 or 3 found errors. Step 6 is skipped if step 5 found any error. Skips are written into skipped. Step 7 always runs. Step 8 runs only when there are no errors.
- Structure rules: a node with no edges at all is an orphan (E_ORPHAN) and is then not also reported as unreachable. Every other node must be reachable from some entry (E_UNREACHABLE_FROM_ENTRY) and must reach some exit (E_CANNOT_REACH_EXIT). A cycle is reported once, with the node ids on one cycle found by networkx.
- Constraint rules (a constraint that names a missing node, lacks a required field, or uses the same node for a and b gives E_CONSTRAINT_BAD_PARAM):
  - must_exist(node_id): the node exists.
  - must_pass_through(node_id): remove that node and its edges; if any exit is still reachable from any remaining entry, the rule is violated. The witness is the shortest path found.
  - must_not_connect(a, b): violated if a path from a to b exists. The witness is that path.
  - must_precede(a, b): remove a; violated if b is reachable from any entry (or is an entry). The witness is the path.
- Coverage: every brief constraint id must appear in the covers of at least one spec constraint (E_BRIEF_CONSTRAINT_UNCOVERED). A covers id that is not in the brief is E_CONSTRAINT_BAD_PARAM.
- Lints: W_MODEL_NODE_NO_INPUTS (needs_model true and no inputs); W_NODE_NO_OUTPUTS (a non-exit node with no outputs); W_TOO_FEW_NODES (fewer than 3 nodes); W_DUP_NODE_NAME (same name ignoring case).
- order_nodes: Kahn's algorithm, ties broken by ascending id. It raises ValueError on a cycle (callers only use it on validated specs).
**Message wording is fixed** (these messages go to the LLM in repair prompts and to users, so the agent does not reword them):

| Code | Message template |
| --- | --- |
| E_SCHEMA | The design is not in the required format: {detail}. |
| E_DUP_ID | Two or more nodes share the id '{id}'. |
| E_BAD_REF | '{where}' refers to '{id}', which is not a node. |
| E_NO_ENTRY | The design has no entry node. |
| E_NO_EXIT | The design has no exit node. |
| E_ORPHAN | Node '{id}' is not connected to anything. |
| E_UNREACHABLE_FROM_ENTRY | Node '{id}' cannot be reached from any entry node. |
| E_CANNOT_REACH_EXIT | Node '{id}' has no path to any exit node. |
| E_CYCLE | The flow loops back on itself through: {ids}. Version 1 designs must not contain loops. |
| E_SELF_LOOP | Node '{id}' has an edge to itself. |
| E_DUP_EDGE | There is more than one edge from '{from}' to '{to}'. |
| E_NODE_LIMIT | The design has {n} nodes; the maximum is {max}. |
| E_EDGE_LIMIT | The design has {n} edges; the maximum is {max}. |
| E_UNKNOWN_CONSTRAINT_KIND | Rule '{id}' uses the unknown kind '{kind}'. Allowed kinds: must_exist, must_pass_through, must_not_connect, must_precede. |
| E_CONSTRAINT_BAD_PARAM | Rule '{id}' ({kind}) {problem}. |
| E_CONSTRAINT_VIOLATED | Rule not satisfied: {rule_text} ({witness}). |
| E_BRIEF_CONSTRAINT_UNCOVERED | The requirement '{brief_text}' is not covered by any rule. Add a rule that lists '{brief_id}' in covers. |
| W_MODEL_NODE_NO_INPUTS | Node '{id}' uses an AI model but lists no inputs. |
| W_NODE_NO_OUTPUTS | Node '{id}' lists no outputs. |
| W_TOO_FEW_NODES | The design has only {n} nodes; most real systems need more parts. |
| W_DUP_NODE_NAME | Nodes '{id1}' and '{id2}' have the same name. |

{witness} is plain text such as a path that avoids 'validator': intake > router > answer.

**Ask me first:** nothing in this phase should need a decision. If a case seems to need one (for example a constraint semantics question), stop and ask.

**Tests:**

1. Fixtures as JSON files under tests/validation/fixtures/valid/ and .../broken/. Valid: 8 specs from different domains (finance, customer support, legal documents, IoT monitoring, healthcare triage, logistics, e-commerce returns, HR onboarding). Together they use every constraint kind at least twice. Broken: at least one file per blocking code, named <CODE>__<short_name>.json; the test discovers them and asserts the exact code is present. Add at least these tricky ones: a diamond graph where must_pass_through fails because one branch avoids the node; a diamond where it passes; two entries where one path avoids the node; must_precede where b is unreachable (passes); a cycle; an orphan that is not also reported as unreachable.
2. Hypothesis property tests: random valid DAGs pass; adding an orphan, a duplicate id or a dangling edge is always caught with the right code; for each constraint kind, generated passing specs pass and generated failing specs fail with a witness.
3. order_nodes: identical output across repeated runs and shuffled input order; every edge goes from earlier to later.
4. parse_and_validate: bad types and bad ids become E_SCHEMA with a readable detail and never raise.
5. Message templates: a test that every code in the table above is produced by at least one fixture and its message matches the template.
**Do not:** call an LLM, the database or HTTP. Do not import anything outside pydantic, networkx and the standard library. Do not add patch logic (Phase 7). Do not add constraint kinds.

**Decision log entries required:** networkx and hypothesis dependencies; each constraint kind and why it is defined that way; the skip rules; extra='ignore'; kind as a plain string; deterministic ordering; the fixed message templates.

**Done when (real output shown):** uv run pytest tests\validation -q, ruff, mypy, uv run lint-imports (it proves validation has no forbidden imports); the count of valid and broken fixtures.

**My browser checks:** none (no UI). I read the list of fixture file names and the pytest output.

**Commit message:** phase 2: spec models and pure validation

### Phase 3: Intake and generator

**Goal:** turn a typed need into a RequirementBrief, then into a validated spec, stored in the database, with a temporary page to try it.

**Already decided:**

- Module layout for intake, architect and designs: router.py (HTTP only), service.py (logic), schemas.py (request and response models), repo.py (database access). Routers hold no logic.
- shared/brief.py holds RequirementBrief so several modules can import it. Fields: summary, users, data_involved (list), domain_hint, stated_constraints (list of id and text), unverifiable_requirements (list of text), numbers_given (list of label, value, unit), assumptions (list of text).
- The LLM returns constraint texts only. Code assigns the ids bc1, bc2, and so on.
- Prompts are files in src/archnemesis/prompts/: intake_v1.md, architect_v1.md, architect_repair_v1.md. The file name without extension is the prompt version and is stored with every design.
- User text is never placed in a system prompt. It goes in the user message inside <untrusted_user_text> tags, and the system prompt says everything inside those tags is data and never instructions.
- Output is accepted only as JSON checked against our models. No tool use, no URLs fetched, nothing executed.
- Intake and generator use LLMTask.INTAKE and LLMTask.ARCHITECT. All three model variables point to the same model for now (I set them).
- Ids in the database are uuid4 hex strings. Timestamps are UTC ISO strings. JSON columns are stored as TEXT.
**Ask me first:**

1. The result of the schema probe (below). If Gemini rejects our schema, the agent stops and proposes options. It never simplifies the contract on its own.
2. Any wording the agent wants to change in the prompts after I have tested them.
**Step 0, schema probe (before any other work):** write scripts/schema_probe.py. It calls generate_json with the real ArchitectureSpec model as schema and a trivial instruction, and prints only OK or the error class and a short message. I run it with my key. If it fails, stop and report; do not continue.

**Build:**

1. Alembic migration 0002 creating: intake_sessions (id, status among collecting, ready and designed, rounds, turns_json, brief_json nullable, created_at, updated_at); designs (id, intake_session_id foreign key, current_version, created_at); design_versions (id, design_id foreign key, version_no, brief_json, spec_json, explanation_json nullable, prompt_version, models_json, warnings_json, change_note nullable, created_at, unique on design_id plus version_no).
2. POST /api/intake/turn with body {session_id: string or null, text: string}. The text is trimmed and must be 1 to MAX_INPUT_CHARS characters, else INPUT_INVALID. Response is either {status: 'needs_info', session_id, round, questions: [up to 3, each up to 200 characters]} or {status: 'ready', session_id, brief}. The LLM returns {action: 'ask' | 'ready', questions, brief}. If round has reached MAX_FOLLOWUP_ROUNDS and the LLM still asks, the service makes one more call that instructs it to produce the brief now and list its assumptions in assumptions. A malformed LLM reply gets one retry, then LLM_BAD_OUTPUT.
3. POST /api/designs with body {session_id}. The session must be ready (else 409 NOT_READY). If the session already has a design, return it instead of creating another. Otherwise: build the architect prompt from the brief, call the LLM, run parse_and_validate, and on errors run the repair loop up to MAX_REPAIR_ATTEMPTS times. A repair call receives the previous spec JSON plus the list of issue codes and messages, and must return the full corrected spec. Total LLM calls at most 3. On success store design version 1 and return the design. On final failure return 422 DESIGN_FAILED with the message I could not produce a design that passes all checks. Please rephrase your need or try again. and up to 5 issue messages; store nothing and log only the attempt count and issue codes.
4. GET /api/designs/{id} returns {design_id, version_no, brief, spec, warnings, flow_order, explanation (null until Phase 5), versions: [{version_no, created_at, change_note}]}. flow_order comes from order_nodes.
5. The architect prompt contains: the role; the JSON shape; the four constraint kinds and what each means; the rules (acyclic, node and edge limits, at least one entry and one exit, node types are free text invented for this need, every brief constraint must appear in some rule's covers or stay in unverifiable_requirements, no numbers or costs anywhere); and the reference patterns as hints.
6. Five to eight reference patterns as files in prompts/patterns/, each at most 120 words, headed with the line 'hint, not a template': retrieval question-answering over documents; human approval workflow; event stream with alerts; tool-using agent with guardrails; data extraction and classification pipeline; conversational assistant with routing. Each says when it fits, the kinds of roles seen, and the kinds of rules seen, without fixed node names.
7. Logging events (and only these fields): intake_turn (session_id, round, action), design_attempt (attempt number, issue codes), design_created (design_id, node count, prompt version, model names).
8. Temporary page apps/web/src/app/page.tsx: a text box, a Send button, follow-up questions shown as a list with an answer box, then a Generate design button, then the raw JSON in a pre element. Mark every temporary line with // TEMP(phase-3); Phase 4 removes them.
**Tests (fake LLM only):** round cap forces the brief; ready path; input too long; generator success first try; invalid then valid succeeds in exactly 2 calls; always invalid stops after exactly 3 calls and stores nothing; an uncovered brief constraint triggers a repair; bc ids are assigned by code; idempotent second call returns the same design; injection strings such as 'ignore previous instructions' stay inside the untrusted tags and the output is still schema-checked; every LLM exception becomes the right error response; logs contain none of the user's text. These prove the pipeline's handling, not the model's behaviour; real behaviour is my manual check.

**Do not:** show a design that failed validation, add endpoints not listed, store failed attempts, call the real LLM in tests.

**Decision log entries required:** each table and why it has those columns; the prompt-file approach and versioning; untrusted-tag handling; repair loop design; idempotent POST; code-assigned bc ids; temporary page.

**Done when (real output shown):** scripts\check.ps1; the schema probe result as I report it; list of what was not run (the real LLM).

**My browser checks:** with the real key, try five needs: finance, customer support, legal documents, IoT monitoring, and one vague (I need an app must trigger follow-up questions, not a guess). For each: every requirement I stated shows up as a rule or in the unverifiable list; a need that says nothing about personal data must not get an invented personal-data rule; the JSON has no costs or timelines.

**Commit message:** phase 3: intake and generator

### Phase 4: Interactive diagram

**Goal:** a real home page and a results page that shows the validated design as a clickable diagram. The Explanation tab is a placeholder.

**Already decided:**

- Routes: / (the intake chat, replacing the temporary page) and /design/[id] (results).
- Files: src/lib/api.ts (typed fetch helpers; every API response is parsed with a Zod schema and an invalid response is shown as an error), src/lib/types.ts, src/components/diagram/ containing DiagramView.tsx, DiagramNode.tsx, DetailPanel.tsx, ConstraintsPanel.tsx, NotesPanel.tsx, FallbackList.tsx, layout.ts, classify.ts, and src/components/Banner.tsx.
- Libraries: @xyflow/react, dagre, @testing-library/react, @testing-library/user-event, jsdom. shadcn components to add: tabs, badge, skeleton, textarea, alert, separator. Each needs a decision log entry.
- Layout: dagre, left to right, nodesep 40, ranksep 80, every node 220 by 72 pixels. Long names are truncated on the card and shown in full in the detail panel.
- Node look comes from structure only. Badges: Entry, Exit, AI model (a node can have several). Border colour by priority: entry emerald, exit violet, needs_model amber, otherwise slate. The type text is shown as small grey text and never changes any style. A small lock icon marks nodes named by any constraint (in node_id, a or b).
- The diagram is read-only: no dragging, no connecting. Pan and zoom are allowed. fitView with padding 0.2. Zoom controls shown. No minimap.
- Selecting: click, or Enter or Space on a focused node. Escape clears the selection. Nodes are reachable with Tab and have the label Node: {name}, {type}.
- Edge label is the flows text, cut to 40 characters, full text on hover and on keyboard focus.
- Detail panel: right column at 1024 pixels wide or more, below the diagram otherwise. Sections in this order: name and type; role; Connected from and Sends to (names taken from edges); inputs; outputs (data labels); Suggestions (not verified) for tech options (hidden when empty); Rules this part takes part in with each rule's plain text. A needs_model node also shows the sentence This part uses an AI model. There is no sizing button.
- Below 768 pixels the canvas is replaced by FallbackList: items in flow_order, each with name, type, role and the names it sends to.
- Banner text, exactly, always visible, not dismissible, above the tabs: Structurally checked, not guaranteed to be the best design. This is not a compliance claim.
- NotesPanel shows lint warnings under the heading Notes and the brief's unverifiable requirements under Not verified by checks. Each section is hidden when empty.
- Tabs: Diagram and Explanation. The Explanation tab shows The explanation arrives in the next step.
- Home page copy: heading Describe the system you need; placeholder For example: a support assistant that answers customers from our help articles and hands hard cases to a person.; button Send. Follow-up questions appear as messages and are answered in the same box. When the brief is ready show it as a card (summary, users, data, rules, not verified) with the button Generate design. While generating show Designing your system. This can take up to a minute. with an elapsed-seconds counter. On success go to /design/{id}. On error show the API message and a Retry button. The chat lives in React state; a refresh on the home page starts over.
- TanStack Query for fetching and mutations. All text is rendered as React text. ESLint rule react/no-danger is set to error.
**Ask me first:** the exact npm package name for dagre (expected @dagrejs/dagre; the agent confirms it from the npm registry or its docs and asks before installing); anything in React Flow that blocks the keyboard behaviour above.

**Tests (Vitest):** layout.ts is pure and tested (positions never overlap, every edge has both ends, output is stable); classify.ts for every combination of entry, exit and needs_model; Zod accepts a valid API payload and rejects a missing field and a wrong type; DetailPanel renders hostile strings literally (<script>alert(1)</script>, **bold**, a 500-character name) and creates no script element; FallbackList follows flow_order; Banner has the exact text.

**Do not:** add editing, dragging, saved positions, a minimap, a sizing button, other colours, or new endpoints.

**Decision log entries required:** each dependency; styling from structure only and why; fixed node size; Zod on every response; the fallback list; removal of the temporary page.

**Done when (real output shown):** scripts\check.ps1; the output of Get-ChildItem -Recurse apps\web\src | Select-String 'TEMP\(phase-3\)' showing no matches.

**My browser checks:** five designs from different needs render; nothing overlaps; clicking and keyboard selection work; a very long name does not break the layout; a page refresh on /design/{id} keeps the design; text I type with angle brackets appears literally; narrow the window below 768 pixels and the list view appears; an unknown id shows a friendly not-found message.

**Commit message:** phase 4: interactive diagram

### Phase 5: Plain-language walkthrough

**Goal:** the Explanation tab, written by the LLM but strictly checked by code.

**Already decided:**

- Files in modules/explainer/: router.py, service.py, schemas.py, verify.py (pure checks), fallback.py (code-only text); prompt file prompts/writer_v1.md. Task is LLMTask.WRITER.
- Generation is lazy: it runs the first time someone opens the Explanation tab, through POST /api/designs/{id}/versions/{n}/explanation. If the version already has an explanation the endpoint returns it and makes no LLM call. The result is stored in design_versions.explanation_json. GET /api/designs/{id} returns it in explanation when present.
- Code prepares the LLM input: nodes in flow_order with name, role, inputs, outputs; edges with flows; constraints with text; which nodes use a model; the brief's numbers_given.
- The LLM returns ExplanationDraft: overview (up to 600 characters), flow_steps (list of node_id and text, text up to 300), parts (list of node_id and text, up to 300), checks (list of constraint_id and text, up to 300), models_text (up to 400, empty when no node uses a model).
- The final Explanation is built by code: {overview, flow: [{step, node_id, node_name, text}], parts: [{node_id, node_name, text}], checks: [{constraint_id, text}], models: {nodes: [{id, name}], text}, source: 'llm' | 'fallback'}. Step numbers and node names come from code, never from the LLM.
- Verification rules in verify.py, each with its own code: X_UNKNOWN_NODE (an id not in the spec); X_UNKNOWN_CONSTRAINT; X_MISSING_PART (a node missing from parts); X_FLOW_ORDER (flow_steps must list every node exactly once in flow_order order); X_TOO_LONG; X_NUMBER; X_FORBIDDEN_WORD; X_COMPLIANCE_CLAIM.
- Number rule: find every digit sequence (including decimals and thousand separators) and every spelled number from three to twenty plus hundred, thousand, million, billion. The words one, two, first, second and third are not checked because they are everyday words. Allowed numbers are only those found in the brief's numbers_given, the node count, and the integers from 1 to the node count. Anything else fails.
- Forbidden words (whole word, case-insensitive): cost, costs, price, pricing, budget, timeline, effort, roi, savings. Compliance claims: the phrases compliant, certified, guarantee, guarantees, guaranteed, fully secure.
- On any failure: call the LLM once more with the list of problems. If it fails again, use the fallback text and set source to fallback. Total LLM calls at most 2.
- Fallback text templates: overview This design has {n} parts. A request enters at {entries} and the result leaves at {exits}.; flow step {name}: {role}; part {name} receives {inputs} and produces {outputs}. (nothing listed when empty); check is the constraint's own text; models Parts that use an AI model: {names}. or No part is marked as using an AI model.
- UI: the Explanation tab shows these headings in order: Overview, How a request flows, Each part, Why the checks exist, Where AI models are used. All plain text paragraphs. No markdown rendering, so react-markdown is not installed. A fallback result shows the note Basic explanation: the written version did not pass our checks. While waiting show Writing the explanation.... On error show the API message and Retry.
**Ask me first:** whether I want the words list changed after I read real output.

**Tests (fake LLM):** each X code with a targeted draft; a number from the brief is allowed while an invented one fails; three fails and one passes; flow order enforced; repeat call returns the stored explanation with zero LLM calls; two failures produce the fallback with source: 'fallback'; fallback text built only from spec data; node names come from the spec even if the draft names differ.

**Do not:** let the LLM output step numbers or node names, add effort or cost words to the prompt, or render markdown.

**Decision log entries required:** lazy generation and why; the structured draft (it prevents invented parts); the number rule and which words were left out and why; the word lists; the fallback; why markdown is not rendered.

**Done when (real output shown):** scripts\check.ps1; list of what was not run (the real LLM).

**My browser checks:** open the Explanation tab for three designs and read it next to the diagram. Everything mentioned exists in the diagram. No figures that I did not give. The sections are in the order above. A second visit loads instantly.

**Commit message:** phase 5: plain-language walkthrough

### Phase 6: Leads, history and export (v1 core complete)

**Goal:** a visitor can contact the team, our team can see leads with the exact design, and the visitor can come back to past designs and take the design away.

**Already decided:**

- New dependencies: email-validator (backend); React Hook Form, @hookform/resolvers, html-to-image (frontend; see Ask me first for the last one). shadcn components to add: dialog, input, label, checkbox, table.
- Module leads (router.py, service.py, schemas.py, repo.py). Migration 0003 creates leads: id, design_id, version_no, name (up to 100), email (up to 254), note (up to LEAD_NOTE_MAX_CHARS, nullable), consent_text_version, created_at. The lead points to an exact design version with a foreign key.
- POST /api/leads body {design_id, version_no, name, email, note?, website?}. Success is 201 {status: 'received'}. Unknown design or version is 404. The field website is a honeypot: hidden from people (visually hidden, tabindex=-1, autocomplete=off, aria-hidden). If it is filled, return the same 201 and store nothing. No duplicate checking in this phase.
- Nothing from a lead is logged. The only log event is lead_created with the lead id.
- Admin: header X-Admin-Token, compared with hmac.compare_digest. If ADMIN_TOKEN is unset or empty, every admin route returns 404. A wrong or missing token returns 401 UNAUTHORIZED with the message Not authorised. Add that code to the error table.
- Admin endpoints: GET /api/admin/leads (newest first, default limit 100, maximum 200; fields id, created_at, name, email, note, design_id, version_no) and GET /api/admin/designs/{id}/versions/{n} (brief, spec, warnings, flow_order, explanation).
- Admin pages: /admin asks for the token in a password field and keeps it in React state only (never localStorage, never in the URL), then shows the leads table. Each row links to /admin/designs/{id}/{n}, which reuses DiagramView and the explanation view read-only with data from the admin endpoint. Admin pages are marked noindex.
- History: browser localStorage key archnemesis.history.v1, a list of {design_id, title, created_at}, newest first, at most 20, where title is the first 60 characters of the brief summary. Read with a Zod schema; corrupt data is ignored. Saved when a design is created. Page /history lists them as links; the home page has a link Past designs. Titles are rendered as text.
- Contact: a Contact our team button in the results header opens a dialog with name, email, optional note, the consent text, and a Send button. It sends the version currently shown. Success text: Thanks. Our team will contact you about this design.
- Consent text: CONSENT_TEXT_VERSION = 'v1' in the backend. Draft wording for my approval: We use your name, email and note only to contact you about this design. We do not share them.
- Export buttons on the results page: Download diagram (PNG); Download explanation (.md) built in the browser from the explanation JSON, starting with the design id, the version and the banner sentence; Print or save as PDF which calls window.print() with a print stylesheet that hides buttons and shows the banner, the diagram and the explanation. If the diagram does not print properly the agent reports it instead of hacking around it.
**Ask me first:** approve or change the consent wording; confirm that html-to-image is what React Flow's own docs suggest for image export (the agent checks the docs and reports); whether the admin table should show notes in full.

**Tests:** lead stored against the exact version; invalid email, empty name and a note over the limit return 422; honeypot filled returns 201 and stores zero rows; unknown design returns 404; a test that captures all log output during a lead submission and asserts the name, email and note strings never appear; admin with the right token, wrong token, missing token and unset token; history helper saves, caps at 20, orders newest first and ignores corrupt JSON; the Markdown export builder is a pure tested function; form shows validation messages.

**Do not:** send email, add accounts, store anything beyond the listed fields, log lead data, or keep the admin token anywhere persistent.

**Decision log entries required:** each new dependency; why leads point to an exact version; honeypot behaviour; admin token handling; localStorage history; export choices; the consent text and who approved it.

**Done when (real output shown):** scripts\check.ps1; Get-ChildItem -Recurse apps | Select-String 'TEMP\(' showing no matches; the agent does not tag anything yet.

**My browser checks:** submit a lead and see it in /admin; a wrong token is rejected; open a lead's design from the admin table and see exactly the version I submitted; a filled honeypot (I test with browser dev tools) stores nothing; history survives a refresh and shows the newest first; the PNG opens and shows the diagram; the Markdown file reads well; print preview looks sensible. After I confirm, the agent runs git tag v1.0-core.

**Commit message:** phase 6: leads, history and export

### Phase 7: Refinement chat (v1.1)

**Goal:** the user changes the design step by step through chat. Every change is a small patch that code checks, shows as a diff, and applies only after Accept.

**Already decided:**

- Module refinement (router.py, service.py, schemas.py, repo.py). Add it to the import-linter contract (a sibling of the other modules, imported by designs) and record it in the log.
- **Step 0:** extend scripts/schema_probe.py to probe the Patch and suggestion schemas. I run it. If Gemini rejects a schema, stop and ask.
- Pure code in modules/validation/patch.py. Op is one flat model: op is one of add_node, remove_node, edit_node, add_edge, remove_edge, add_constraint, edit_constraint, remove_constraint, set_entry_exit, with optional fields node, node_id, changes, edge, from_id, to_id, constraint, constraint_id, entry_ids, exit_ids. changes is a flat model of optional fields (name, type, role, inputs, outputs, tech_options, needs_model, text, node_id, a, b, covers). Patch has ops, 1 to MAX_PATCH_OPS.
- apply_patch(spec, patch, brief_constraints, limits, dropped_brief_ids=frozenset()) -> PatchResult works on a deep copy and applies ops in order. Op errors stop it with ok false: P_EMPTY_PATCH, P_TOO_MANY_OPS, P_MISSING_FIELD, P_UNKNOWN_NODE, P_UNKNOWN_EDGE, P_UNKNOWN_CONSTRAINT, P_DUPLICATE_ID. If all ops apply, it runs validate on the result (ignoring the brief ids in dropped_brief_ids); ok means no errors. A node id and a constraint kind can never be edited. Removing a node never removes its edges; leftover edges fail validation as E_BAD_REF.
- compute_diff(old, new) returns added, removed and changed nodes (with the names of changed fields), added, removed and changed edges, added, removed and changed constraints, and whether entry or exit changed. Ordering by id. describe_diff(diff) writes the version's change_note in code, for example Added node approval; removed edge a > b., cut at 200 characters. The LLM never writes a change note.
- Patch statuses: proposed (valid), blocked (op error or any error other than coverage), needs_confirmation (the only errors are E_BRIEF_CONSTRAINT_UNCOVERED and each uncovered requirement was covered only by rules this patch removes), accepted, rejected, superseded.
- Dropping a rule on purpose: for needs_confirmation the UI shows a red box listing each requirement that will stop being checked and a checkbox I understand this requirement will no longer be checked. Accept needs confirm_drop: true. On accept those requirement texts move from stated_constraints to unverifiable_requirements in the new version, prefixed Dropped by user: .
- Migration 0004: chat_messages (id, design_id, role user or assistant, text, created_at) and patches (id, design_id, kind change or suggestion, base_version, status, patch_json, diff_json, issues_json, reason nullable, created_at, decided_at nullable).
- Endpoints:
  - POST /api/designs/{id}/chat body {message} (1 to 1000 characters). The LLM (ARCHITECT task, generate_json, prompt refine_v1.md) returns {reply (up to 500 characters), patch or null}. Its context is the brief, the current spec and the last 6 messages; the user text sits in the untrusted tags. Response {message_id, reply, patch: null or {id, status, diff, issues}}. No automatic repair: a blocked patch is shown with its rule messages. One turn.
  - POST /api/designs/{id}/suggestions (prompt suggest_v1.md). The LLM returns up to 5 items of title (up to 60), reason (up to 140) and patch. Code runs each through apply_patch and keeps only proposed and needs_confirmation. Response {suggestions: [{patch_id, title, reason, status, diff}], discarded_count}. One turn. The UI labels each Suggestion (opinion, not verified) and shows {n} suggestions were discarded because they broke a rule. when discarded_count is above zero.
  - POST /api/designs/{id}/patches/{pid}/accept body {confirm_drop?}. The server re-applies the stored patch to the CURRENT spec and re-validates; it never trusts a stored result. If the base version is no longer current, 409 STALE_PATCH; if blocked, 409 PATCH_BLOCKED; if confirmation is missing, 409 CONFIRMATION_REQUIRED. On success it creates version n+1 (explanation empty, prompt_version refine_v1, change note from describe_diff), marks other proposed patches on the same base superseded, and returns the design.
  - POST /api/designs/{id}/patches/{pid}/reject.
  - POST /api/designs/{id}/restore body {version_no} creates a new latest version that is an exact copy of the chosen one, with the note Restored from v{k}. It counts toward MAX_VERSIONS. Restoring the current version is a 409.
  - GET /api/designs/{id}/messages and GET /api/designs/{id}/versions/{n} (read-only view of any version).
- Caps: at MAX_REFINEMENT_TURNS user messages (chat or suggestions) return 409 CAP_TURNS with This design has reached the limit of {n} change requests. Please contact our team to continue. At MAX_VERSIONS return 409 CAP_VERSIONS with the same pattern. Add all new codes to the error table and contracts.
- Explanations are regenerated per version through the Phase 5 lazy endpoint. A new version starts with none.
- UI on the results page: a Refine this design panel with the message list, an input (up to 1000 characters), Send, and the button What can we add or remove?. Counters Change requests used: {x} of {max} and Versions: {y} of {max}.
- Diff view: the diagram shows the union of the new spec and the removed parts of the old one. Added: green border and badge New. Removed: red dashed border, red dashed edges, badge Removed. Edited: blue border and badge Edited. Buttons Accept and Reject. A blocked patch lists the broken rules (the validation messages) and offers only Dismiss. A suggestion's Apply first opens the diff view; Accept is only available there.
- Versions panel: newest first with version number, date, change note, a Current badge, View (read-only) and Restore (with a confirm dialog).
- Node shortcuts in the detail panel only fill the chat box and never send. Ask about this node fills Tell me about the '{name}' part: why is it needed and what could go wrong? and Remove this node fills Remove the '{name}' part and fix the connections around it.
**Ask me first:** the schema probe result; any need to change a status, endpoint or cap above.

**Tests:** each op, success and every P code; removing a node that still has edges gives E_BAD_REF; removing a node that a must_pass_through rule needs is blocked and the message names the rule; removing a rule that leaves a requirement uncovered gives needs_confirmation; accept without confirmation is 409 and with it updates the brief as described; the database spec is unchanged after chat and after suggestions until Accept; a stale patch is 409 and superseded; accept re-validates even if the stored result was tampered with; restore produces a spec equal to the old one and a new version number; both caps; diff and describe_diff are exact and deterministic; Hypothesis: for random valid specs and random ops, apply_patch either fails or returns a fully valid spec, never an invalid spec marked ok; injection text stays inside the untrusted tags; logs never contain message text; on the frontend, the union-graph builder, the diff-state classifier and the prefill strings.

**Do not:** apply any change without Accept, let the LLM write a change note, add automatic repair, allow kind or id edits, or cascade deletions.

**Decision log entries required:** each table; the flat op model and why (schema support); the patch statuses; the drop-on-purpose rule; accept re-validates on the server; restore creates a new version; caps; the import-linter change.

**Done when (real output shown):** scripts\check.ps1; what was not run (the real LLM).

**My browser checks:** ask for an approval step before the answer and see the green diff; try removing a node that a rule needs and see it blocked with the rule named; accept one change, reject another; run What can we add or remove?; restore v1 and check it equals the original; set MAX_REFINEMENT_TURNS=2 in my .env and hit the cap; confirm the explanation changes with each version; use both node shortcuts.

**Commit message:** phase 7: refinement chat (tag v1.1 only after I confirm).

### Phase 8: Hardening and evaluation

**Goal:** protect the free tier, prove quality can be measured, and make setup repeatable.

**Already decided:**

- Rate limiting is a small in-memory sliding window per client IP written in the project, with no new dependency. Defaults in settings: intake/turn 60 per hour, POST /api/designs 10 per hour, chat and suggestions 30 per hour together, leads 5 per hour. Exceeding returns 429 RATE_LIMITED with a Retry-After header and the message Too many requests. Please try again later. The limits reset when the server restarts; the log records this limitation. Behind a proxy the client IP would need extra handling; that is out of scope now.
- Cache: table spec_cache (key, spec_json, created_at). The key is a SHA-256 of the canonical JSON of the brief plus the prompt version plus the architect model name; entries expire after 7 days. A hit skips the LLM call but still creates a NEW design row from the cached spec, so two people never share a design.
- Input caps: every request body field has a maximum length checked by Pydantic; the agent lists them all in the report.
- Evaluation set in evals/cases/: 5 to 8 JSON files, each with id, need_text, followup_answers (scripted answers used if intake asks), and expect (min_nodes, max_nodes, must_have_constraint_kinds). evals/run.py runs the real pipeline in-process with the real LLM and writes evals/results/YYYYMMDD-HHMM.json with, per case: validity, constraint kinds found, node count, explanation source, forbidden-word and number check results, LLM call counts, the prompt versions and the model names. evals/compare.py a.json b.json prints a side-by-side table of two runs. I run these, never the normal test suite.
- Log audit: an end-to-end test with the fake client uses sentinel strings in the need text, the chat messages and the lead form, then asserts none appear in captured logs.
- Security headers on the Next.js app: X-Content-Type-Options: nosniff, Referrer-Policy: strict-origin-when-cross-origin, X-Frame-Options: DENY. A Content-Security-Policy is only investigated and reported, not enabled, in this phase.
- README is finished: setup from a clean clone in order (uv sync, npm install, copy .env.example to .env, uv run alembic upgrade head, then the two run commands).
**Ask me first:** whether to enable a Content-Security-Policy after the agent's report; the evaluation cases' wording (I approve the 5 to 8 needs).

**Tests:** rate-limit window and the 429 response; cache hit skips the LLM and creates a new design row; cache expiry; the log audit; eval runner on the fake client for structure only (no real LLM in tests).

**Do not:** run the eval set automatically, enable CSP without asking, add a rate-limit dependency, or share design rows between users.

**Decision log entries required:** each limit and why; the cache key and why it creates a new design; the eval format; the security headers; known limitations.

**Done when (real output shown):** scripts\check.ps1; the README steps run from a fresh clone in a temporary folder (output shown).

**My browser checks:** I run evals\run.py before and after a prompt change and read compare.py; I trigger a rate limit and see the friendly message; I follow the README from scratch.

**Commit message:** phase 8: hardening and evaluation

## 8. Assumptions and pending decisions

This plan assumes the recommended options. Tell me if any is wrong before Phase 0.

1. New repo arch-nemesis (not a branch).
2. SQLite (not Postgres).
3. Leads are saved only, no email sending. The basic POC is prepared by hand.
4. Straight to the chat page, no landing page in v1.
5. v1.0 ships at the end of Phase 6. Refinement is v1.1.