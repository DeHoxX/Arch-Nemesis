# How to read this file

This file is the living record of every technical, architectural, and design choice in Arch-Nemesis. It exists to help learners and developers understand not just what code was written, but why it was written that way.

Every decision entry uses a strict, uniform template:
- **Title (`### D-xxx — Phase N — label`)**: The unique identifier, the phase it belongs to, and a category label (`file`, `dependency`, `step`, `design`, `deviation`, or `fix`).
- **What**: Exactly one sentence stating the decision that was made.
- **Why**: Two to five plain sentences explaining the rationale in simple language suitable for a beginner.
- **Alternatives considered**: At least one concrete alternative that was evaluated and why it was rejected.
- **If we removed it**: What would break, degrade, or become harder to maintain if this decision were undone.
- **Decided by**: Who made the choice (`plan`, `agent proposed, user approved`, or `agent alone`).
- **Status**: The current state of the decision (`active` or `superseded by D-0xx`). Past entries are never rewritten; new choices supersede old ones.

## Glossary

- **git**: A tool that tracks changes to computer files over time. It lets you inspect past versions and undo mistakes.
- **repo**: A folder tracked by git that holds all of a project's files and their recorded history. It keeps all versions in one place.
- **branch**: An independent timeline in a repo where you can make changes without affecting the main files. Once your changes work, you can merge them back.
- **commit**: A saved checkpoint in a repo that captures the exact state of files at a given moment. Each checkpoint has a message explaining what changed.
- **LLM**: A computer program trained on large amounts of text that can understand questions and write answers. In this project, it suggests system architectures and writes explanations.
- **API**: A structured way for two programs to talk to each other over a network. For example, our web browser sends requests to our server through an API.
- **schema**: A rulebook that defines the shape, fields, and types of data a program expects to receive. It stops unexpected or broken data from entering the system.
- **validation**: An automatic check that tests whether data follows a schema and specific rules. In this project, code validation ensures a design is structurally correct before anyone sees it.
- **decision log**: A written record explaining why choices, tools, and rules were chosen throughout a project. It helps anyone reading the project understand why things were built this way.

## File map

The following table tracks every file and directory in Arch-Nemesis, why it exists, and which phase introduced it:

### Root Directory
- `GEMINI.md`: Primary rules and working protocol file automatically read by Antigravity; establishes project constraints; Phase 0.
- `CLAUDE.md`: Cross-tool pointer referencing GEMINI.md so instructions remain discoverable in all environments; Phase 0.
- `README.md`: Project introduction, environment prerequisites, and target start commands; Phase 0.
- `.gitignore`: Rules listing files and patterns git must never track, preventing secrets and caches from leaking; Phase 0.

### docs/
- `docs/BUILD_PLAN.md`: Master specification containing the 8-phase implementation roadmap, contracts, and rules; Phase 0.
- `docs/contracts.md`: Verbatim specification of all system limits, data schemas, error codes, and linting rules; Phase 0.
- `docs/DECISIONS.md`: The official project decision log containing glossary, file map, summaries, and decision entries; Phase 0.

### apps/api/
- `apps/api/.gitkeep`: Placeholder file ensuring git preserves the backend application folder; Phase 0.
- `apps/api/.env.example`: Template listing all required backend environment variables with blank values for local configuration; Phase 0.
- `apps/api/src/archnemesis/shared/brief.py`: Pure domain models for requirement briefs (`RequirementBrief`, `BriefConstraint`, `BriefNumber`); Phase 3.
- `apps/api/src/archnemesis/dependencies.py`: FastAPI dependency injection providers for db sessions and LLM clients; Phase 3.
- `apps/api/src/archnemesis/prompts/`: System prompt markdown files (`intake_v1.md`, `architect_v1.md`, `architect_repair_v1.md`) and patterns; Phase 3.
- `apps/api/src/archnemesis/modules/intake/`: Intake discovery module (`schemas.py`, `repo.py`, `service.py`, `router.py`); Phase 3.
- `apps/api/src/archnemesis/modules/architect/`: Architect synthesis and repair loop (`service.py`); Phase 3.
- `apps/api/src/archnemesis/modules/designs/`: Designs persistence and retrieval module (`schemas.py`, `repo.py`, `service.py`, `router.py`); Phase 3.
- `apps/api/alembic/versions/0002_intake_and_designs.py`: Migration defining intake sessions, designs, and design versions; Phase 3.

### apps/web/
- `apps/web/.gitkeep`: Placeholder file ensuring git preserves the frontend Next.js application folder; Phase 0.
- `apps/web/src/app/page.tsx`: Web application home page including System Health card and Phase 3 verification test harness; Phase 1, Phase 3.

### scripts/
- `scripts/.gitkeep`: Placeholder file ensuring git preserves the operational scripts folder; Phase 0.
- `scripts/schema_probe.py`: Step 0 verification probe for live Gemini schema compatibility; Phase 3.

### evals/
- `evals/.gitkeep`: Placeholder file ensuring git preserves the evaluation dataset and benchmark runner folder; Phase 0.

### Generated Directories (Grouped)
- `.venv/`, `node_modules/`, `.next/`, `__pycache__/`, test caches (`.pytest_cache/`, `.mypy_cache/`, `.ruff_cache/`), database files (`*.sqlite`, `*.db`), and log files (`*.log`): Local run artifacts, build outputs, and installed packages excluded from version control by `.gitignore`; Phase 0.

## Phase summaries

### Phase 0: Constitution (no code)
- **What it added**: Initialized clean git repository with default branch `main`. Created directory skeleton (`apps/api`, `apps/web`, `scripts`, `evals`) with `.gitkeep` placeholders and populated `docs/`. Added active project rules in `GEMINI.md` and pointer in `CLAUDE.md`. Established authoritative data contracts in `docs/contracts.md` and master build plan in `docs/BUILD_PLAN.md`. Initialized decision log in `docs/DECISIONS.md`. Added `.gitignore` and `apps/api/.env.example`. Authored `README.md` with system requirements.
- **How the pieces connect now**:
  Human / Agent -> reads GEMINI.md (project rules & working protocol)
                 -> consults docs/contracts.md (data structures & limits)
                 -> consults docs/DECISIONS.md (glossary, file map & decision records)
                 -> prepares Phase 1 environment without application code or live server processes.
- **Three things you can try yourself**:
  1. Check staged repository files: `git status`
  2. Verify all rulebook headings: `Get-Content GEMINI.md | Select-String '^## '`
  3. Inspect data contracts and limits: `Get-Content docs/contracts.md -TotalCount 30`
- **What is still missing**:
  Backend Python environment and FastAPI server (Phase 1); Frontend Next.js web application (Phase 1); LLM integration and health endpoint (Phase 1); deterministic validation engine (Phase 2); intake, generator, interactive diagram, and explainer (Phases 3-6).

## Decisions

### D-001 — Phase 0 — design
What: Create Arch-Nemesis as an entirely fresh git repository, separate from ModelFit.
Why: Starting fresh ensures Arch-Nemesis has no inherited baggage, legacy dependencies, or obsolete code. ModelFit remains completely untouched on its own branch and can be consulted read-only for inspiration without creating coupling.
Alternatives considered: Building Arch-Nemesis inside the ModelFit repository on a new feature branch. Rejected because branch switching risks cross-contamination and mixing dependencies.
If we removed it: Arch-Nemesis would be entangled with ModelFit's configuration and code history, making setup and evaluation fragile.
Decided by: plan
Status: active

### D-002 — Phase 0 — design
What: Use SQLite as the database engine for version 1 of Arch-Nemesis.
Why: SQLite requires zero installation, runs as a single local file, and provides full ACID transactions. For a single-machine application and local development, it eliminates database server management entirely.
Alternatives considered: PostgreSQL. Rejected because running a separate database server adds setup overhead without any benefit during single-machine development.
If we removed it: We would have to require a running Postgres instance or Docker container, violating the constraint of a simple Windows local setup.
Decided by: plan
Status: active

### D-003 — Phase 0 — design
What: Run the application directly on the host Windows machine without Docker.
Why: Running natively using Python with `uv` and Node.js with `npm` is much faster and simpler on Windows. It avoids container networking quirks, file-sharing latency, and Docker Desktop licensing or configuration issues.
Alternatives considered: Docker Compose. Rejected because containerization adds complexity and does not fit the user's lightweight setup requirements.
If we removed it: The project would require Docker Desktop, container build scripts, and volume mounts, creating friction for a beginner.
Decided by: plan
Status: active

### D-004 — Phase 0 — design
What: Put the Google Gemini client behind a generic `LLMClient` protocol interface.
Why: Decoupling the AI interface allows tests to run against a deterministic fake client without spending API quota or waiting on network round-trips. It also enables swapping or updating AI models without rewriting application code.
Alternatives considered: Calling the Google GenAI SDK directly from route handlers and business logic. Rejected because direct SDK calls make unit testing slow, expensive, and flaky.
If we removed it: Every test run would require network access, API keys, and real Gemini quota, making tests nondeterministic and costly.
Decided by: plan
Status: active

### D-005 — Phase 0 — design
What: Build a pure validation module that depends only on Pydantic, networkx, and standard library.
Why: Architectural verification must be authoritative, objective, and testable in isolation. Keeping validation free of web frameworks, databases, or AI libraries guarantees that structural checks can never be compromised by network or model failures.
Alternatives considered: Validating architectures directly inside database models or FastAPI request handlers. Rejected because coupling validation to the web layer prevents standalone testing and reuse.
If we removed it: Validation checks would become entangled with database state and API logic, making comprehensive test suites difficult to run reliably.
Decided by: plan
Status: active

### D-006 — Phase 0 — design
What: Restrict version 1 architecture diagrams to Directed Acyclic Graphs (DAGs).
Why: Graphs without cycles have clear entry and exit points, making path traversal and constraint validation mathematically deterministic. Feedback loops can still be described in a component's text role without drawing circular edges on the diagram.
Alternatives considered: Allowing arbitrary circular graphs and feedback loops in v1. Rejected because detecting unreachable nodes, predecessor rules, and traversal paths becomes significantly more complex and error-prone.
If we removed it: Graph traversal algorithms could encounter infinite loops, and verifying rules like `must_pass_through` would become ambiguous.
Decided by: plan
Status: active

### D-007 — Phase 0 — design
What: Restrict architectural constraints to a closed set of four verifiable kinds (`must_exist`, `must_pass_through`, `must_not_connect`, `must_precede`).
Why: Code can only enforce rules that have clear mathematical definitions. Any requirement that cannot be verified by code is classified as an unverifiable requirement and shown honestly to the user rather than faked.
Alternatives considered: Allowing free-form constraint strings evaluated by the LLM. Rejected because the LLM is not deterministic and cannot be trusted to verify its own output.
If we removed it: The system would either fail to enforce rules or present false compliance assurances to users.
Decided by: plan
Status: active

### D-008 — Phase 0 — design
What: Forbid all cost, effort, pricing, or timeline figures anywhere in version 1.
Why: Arch-Nemesis is an architectural pre-sales tool, not an estimation engine. Language models frequently hallucinate realistic-sounding numbers that have no basis in reality, which would damage client trust.
Alternatives considered: Asking the LLM to provide rough ballpark estimates for engineering hours and cloud bills. Rejected because invented estimates mislead clients and fail core accuracy rules.
If we removed it: The system would produce ungrounded numbers, violating the core principle that code produces every number and LLMs invent none.
Decided by: plan
Status: active

### D-009 — Phase 0 — design
What: Save leads to the local database without sending automated emails, preparing POCs by hand.
Why: Keeping lead handling minimal simplifies the architecture and removes email server dependencies. Having human engineers prepare the proof-of-concept by hand ensures high quality and builds trust through direct customer relationships.
Alternatives considered: Integrating SendGrid or AWS SES for automated email confirmations and automated POC generation. Rejected because automated POCs are out of scope and external email services add unnecessary failure points.
If we removed it: We would need external email credentials, webhooks, and retry queues, vastly expanding scope.
Decided by: plan
Status: active

### D-010 — Phase 0 — design
What: Use `dagre` for automated left-to-right diagram layout on the frontend.
Why: `dagre` is a lightweight, battle-tested layout algorithm designed specifically for directed graphs. It produces clean, readable left-to-right arrangements without heavy computational overhead.
Alternatives considered: `elkjs` (Eclipse Layout Kernel) or manual drag-and-drop coordinates. Rejected because `elkjs` is significantly heavier and manual positioning creates unnecessary friction for users.
If we removed it: Nodes would render on top of each other or require custom geometric calculation code to position cards properly.
Decided by: plan
Status: active

### D-011 — Phase 0 — design
What: Ensure restoring a prior architecture version creates a new version record rather than overwriting history.
Why: Version history must remain completely immutable. Preserving every historical version ensures that existing lead records, export files, and diff calculations continue pointing to exact historical states.
Alternatives considered: Overwriting the current design record with previous version data or truncating the history table. Rejected because destructively modifying history breaks audit trails and invalidates existing links.
If we removed it: Past versions referenced by sales leads would become corrupted or impossible to inspect accurately.
Decided by: plan
Status: active

### D-012 — Phase 0 — design
What: Configure LLM model names using individual environment variables for each distinct task.
Why: Different tasks require different capabilities; for example, the architect generator needs stronger reasoning than the intake or explainer tasks. Using separate environment variables (`LLM_MODEL_INTAKE`, `LLM_MODEL_ARCHITECT`, `LLM_MODEL_WRITER`) allows selective model upgrades without touching code.
Alternatives considered: Hardcoding a single model name across the entire application. Rejected because it prevents testing different model sizes or upgrading individual pipeline steps.
If we removed it: Upgrading the architect model to a larger variant would force code modifications and prevent fine-tuned cost optimization.
Decided by: plan
Status: active

### D-013 — Phase 0 — design
What: Exclude ModelFit integration and hardware sizing from version 1 of Arch-Nemesis.
Why: Arch-Nemesis must prove its core value as a system architecture diagramming tool first. Integrating complex hardware sizing and multi-GPU benchmarking adds significant domain complexity that belongs in a dedicated later phase.
Alternatives considered: Bundling ModelFit's hardware sizing database directly into Phase 4. Rejected because it distracts from the core diagramming and walkthrough workflows.
If we removed it: Scope creep would delay delivering a functional architecture tool, increasing testing surface and risk of bugs.
Decided by: plan
Status: active

### D-014 — Phase 0 — deviation
What: Use `GEMINI.md` as the primary workspace rules file read by Antigravity, adding `CLAUDE.md` as a pointer.
Why: Antigravity's official customization system automatically searches for and loads rule files named `GEMINI.md` or `AGENTS.md` when navigating project directories, but does not read `CLAUDE.md`. Placing the active instructions in `GEMINI.md` ensures the AI pair programmer always respects project rules, while providing `CLAUDE.md` ensures portability across different assistant tools.
Alternatives considered: Sticking strictly to `CLAUDE.md` without `GEMINI.md`. Rejected because Antigravity would ignore the file, leaving the AI operating without automated rule enforcement.
If we removed it: Antigravity would not automatically inject project rules into its context, requiring manual reminders for every instruction.
Decided by: agent proposed, user approved
Status: active

### D-200 — Stage E1 — deviation
What: Introduce evaluation suite cases, pure metrics aggregation in evals/metrics.py, side-by-side comparison in evals/compare.py, and dedicated test runner in evals/tests.
Why: To systematically measure LLM prompt performance across multiple repeated runs rather than relying on single manual invocations, Stage E1 introduces the evaluation dataset in evals/cases/ and evaluation tools. evals/metrics.py is introduced as a pure calculation module containing run dataclasses and aggregation statistics (attempt-1 pass rate, final pass rate, fallback rate, code repair rate, average node counts, lint and error counts) with zero database, LLM, or app-layer imports. As a deviation approved by the user, tests live in evals/tests/test_evals.py rather than apps/api/tests/, preserving apps/api/pyproject.toml and its type-checker scope unchanged. scripts/check.ps1 receives one added step to run pytest on evals/tests from the apps/api virtual environment.
Alternatives considered:
1. Placing test_evals.py in apps/api/tests/: Rejected because it would require altering apps/api/pyproject.toml (adding repo-root to pythonpath and mypy_path), coupling the core API type-check scope to root developer tooling.
2. Inlining metric calculations into evals/compare.py: Rejected because separating pure aggregation into evals/metrics.py allows clean unit testing without CLI argument parsing or presentation overhead.
If we removed it: Prompt performance changes would remain anecdotal and could not be regression-tested deterministically across runs.
Decided by: agent proposed, user approved
Status: active

### D-015 — Phase 0 — file
What: Create the foundational directory structure (`apps/api`, `apps/web`, `scripts`, `evals`) with `.gitkeep` files, and `docs/` populated with documentation.
Why: Git only tracks files, not empty folders. Placing an empty `.gitkeep` file in empty directories ensures that the project layout defined in the plan is preserved in version control from the very beginning. The `docs/` folder does not need a `.gitkeep` because it contains `BUILD_PLAN.md`, `contracts.md`, and `DECISIONS.md`.
Alternatives considered: Leaving folders uncreated until code files are written in Phase 1. Rejected because having an explicit directory structure establishes clear organizational boundaries for backend, frontend, docs, and tooling.
If we removed it: The expected directory layout would not exist in git clones, leading to missing path errors during initial setup.
Decided by: plan
Status: active

### D-016 — Phase 0 — file
What: Establish strict security and configuration boundaries using `.gitignore` and `apps/api/.env.example`.
Why: Sensitive environment values, local databases, and temporary build caches must never enter version control. Providing a clean `.env.example` file documents the required settings without risking credential leaks.
Alternatives considered: Committing a default `.env` file with dummy keys. Rejected because developers often overwrite dummy keys with real secrets and accidentally commit them.
If we removed it: Developers might commit API keys, sqlite database files, and build caches to git, creating security vulnerabilities and repository bloat.
Decided by: plan
Status: active

### D-017 — Phase 0 — step
What: The agent never runs git push, never configures or alters git remotes, and never creates branches or tags unless explicitly requested by the user.
Why: The user retains complete authority and control over remote repository publishing and git branching. Local commits are created only upon user confirmation, while pushing code upstream to GitHub is performed solely by the user.
Alternatives considered: Allowing the agent to set up a GitHub remote and automatically push after phase commits. Rejected because pushing without human review risks pushing unverified code or leaking credentials upstream.
If we removed it: The agent might attempt to push code or create remotes automatically, bypassing user review and violating personal repository control.
Decided by: user approved
Status: active

### D-018 — Phase 1 — dependency
What: Install `fastapi` and `uvicorn[standard]` for the backend HTTP server.
Why: FastAPI provides asynchronous routing and automatic request validation using Python type hints. Uvicorn is the high-performance ASGI server that runs the FastAPI application.
Alternatives considered: Flask or Django. Rejected because Flask lacks native async support and Django is overly heavy for a lightweight API.
If we removed it: We would have no web server to handle HTTP requests or route endpoints from the frontend.
Decided by: plan
Status: active

### D-019 — Phase 1 — dependency
What: Install `pydantic` and `pydantic-settings` for data models and configuration.
Why: Pydantic enforces strict type checking and data validation at runtime. Pydantic-settings automatically loads and parses environment variables from `.env` files into strongly-typed settings objects.
Alternatives considered: Python dataclasses and python-dotenv. Rejected because dataclasses do not validate runtime types and dotenv requires manual parsing for complex types.
If we removed it: Invalid user inputs or broken environment variables would enter the system undetected, causing runtime crashes.
Decided by: plan
Status: active

### D-020 — Phase 1 — dependency
What: Install `sqlalchemy[asyncio]` and `aiosqlite` for database persistence.
Why: SQLAlchemy provides a structured object-relational mapping and connection pooling layer. The `aiosqlite` driver enables asynchronous, non-blocking database queries to our local SQLite database.
Alternatives considered: Synchronous SQLite via the built-in `sqlite3` module. Rejected because synchronous disk I/O blocks the FastAPI async event loop during database operations.
If we removed it: Every database read or write would stall the entire server, degrading response times under concurrency.
Decided by: plan
Status: active

### D-021 — Phase 1 — dependency
What: Install `alembic` for database schema migrations.
Why: Alembic tracks and applies changes to the database structure over time in versioned script files. It ensures database tables can be consistently created and upgraded across machines.
Alternatives considered: Running raw SQL `CREATE TABLE` scripts at application startup. Rejected because startup scripts cannot safely track schema modifications or perform rollbacks.
If we removed it: Updating database tables in later phases would risk corrupting existing databases or requiring manual file deletion.
Decided by: plan
Status: active

### D-022 — Phase 1 — dependency
What: Install `structlog` for structured logging and sensitive data redaction.
Why: Structlog outputs structured JSON log entries with consistent contextual fields like request IDs. It allows registering a custom processor that automatically censors sensitive keys (such as email, tokens, and prompts) before anything is printed.
Alternatives considered: Python standard library `logging`. Rejected because standard logging requires cumbersome boilerplate to format JSON and recursively redact nested dictionary values.
If we removed it: Sensitive user text or credentials could accidentally leak into server logs, violating our strict privacy rules.
Decided by: plan
Status: active

### D-023 — Phase 1 — dependency
What: Install `google-genai` for communicating with Google Gemini AI models.
Why: `google-genai` is the official Google SDK supporting the latest Gemini API features, including structured JSON schema outputs. It provides the native client used behind our provider-neutral `LLMClient` protocol.
Alternatives considered: Sending raw HTTP requests with `httpx` or using legacy `google-generativeai`. Rejected because raw requests require manual authentication and message formatting, while legacy libraries do not support modern schema features.
If we removed it: The backend would be unable to connect to Gemini to generate architectures or explanations.
Decided by: plan
Status: active

### D-024 — Phase 1 — dependency
What: Install backend development tools `pytest`, `pytest-asyncio`, `httpx`, `respx`, `ruff`, `mypy`, and `import-linter`.
Why: Pytest and pytest-asyncio run automated tests; httpx and respx allow fast in-memory HTTP testing without real network calls; ruff formats and lints code rapidly; mypy enforces strict type safety; and import-linter enforces architectural layer isolation.
Alternatives considered: Flake8, black, and unittest. Rejected because ruff is vastly faster and replaces multiple linters, while pytest provides superior async fixtures.
If we removed it: We would have no automated way to verify code correctness, type integrity, or architectural boundaries.
Decided by: plan
Status: active

### D-025 — Phase 1 — dependency
What: Install Next.js (`next`), `react`, and `react-dom` for the frontend web application.
Why: Next.js provides a modern React framework with file-system App Routing and built-in API proxy rewriting. It handles server rendering, asset compilation, and client-side page updates seamlessly.
Alternatives considered: Vite with a standalone React Single Page App (SPA). Rejected because Next.js simplifies routing and local `/api` path rewriting out of the box.
If we removed it: We would have no frontend user interface framework to render interactive diagrams or forms.
Decided by: plan
Status: active

### D-026 — Phase 1 — dependency
What: Install `typescript`, `@types/node`, `@types/react`, and `@types/react-dom` installed by create-next-app.
Why: TypeScript adds static type checking to JavaScript to prevent bugs before code runs. The `@types/*` packages provide type definitions for Node.js runtime and React primitives.
Alternatives considered: Plain JavaScript without TypeScript. Rejected because the project rules require strict TypeScript to prevent null reference errors.
If we removed it: Frontend code would lack compile-time type verification, allowing undetected runtime type errors.
Decided by: plan
Status: active

### D-027 — Phase 1 — dependency
What: Install `eslint` and `eslint-config-next` installed by create-next-app.
Why: ESLint analyzes frontend JavaScript and TypeScript code to catch problematic patterns and style inconsistencies. `eslint-config-next` provides Next.js-specific linting rules, including detecting unoptimized images and unsafe script injections.
Alternatives considered: Biome or running without a frontend linter. Rejected because Next.js standard tooling integrates ESLint natively into build verification.
If we removed it: Unsafe patterns (like dangerous inner HTML or missing React hooks dependencies) could slip into frontend code.
Decided by: plan
Status: active

### D-028 — Phase 1 — dependency
What: Install Tailwind CSS and `@tailwindcss/postcss` for frontend styling.
Why: Tailwind CSS provides utility-first CSS classes directly in markup for consistent, responsive styling. `@tailwindcss/postcss` integrates Tailwind compilation into Next.js's PostCSS asset pipeline.
Alternatives considered: Traditional CSS files or CSS Modules. Rejected because utility classes ensure faster styling without naming collisions or dead stylesheet accumulation.
If we removed it: We would have no utility styling system to build layout panels and diagram cards.
Decided by: plan
Status: active

### D-029 — Phase 1 — dependency
What: Install `lucide-react`, `clsx`, and `tailwind-merge` installed by shadcn/ui.
Why: Lucide-react provides lightweight, accessible SVG icons; clsx allows constructing conditional className strings; and tailwind-merge resolves conflicting Tailwind class names without style leakage.
Alternatives considered: FontAwesome or custom SVG strings. Rejected because Lucide icons are tree-shakeable and natively supported by shadcn component templates.
If we removed it: Dynamic styling on buttons and cards would cause CSS class specificity conflicts.
Decided by: plan
Status: active

### D-030 — Phase 1 — dependency
What: Install `@tanstack/react-query` for frontend server-state management.
Why: TanStack Query manages asynchronous server state in React, automatically handling loading indicators, error states, and cache invalidation. It eliminates boilerplate `useEffect` hooks for API requests.
Alternatives considered: Native `fetch` inside `useEffect` or SWR. Rejected because native fetch lacks built-in caching and request deduplication, while TanStack Query provides superior mutation handling.
If we removed it: Frontend network code would require extensive manual state tracking for loading, error, and caching behavior.
Decided by: plan
Status: active

### D-031 — Phase 1 — dependency
What: Install `vitest`, `jsdom`, and `@testing-library/react` for frontend unit testing.
Why: Vitest provides a fast, ESM-native unit test runner compatible with TypeScript and React. JSDOM simulates a browser DOM in Node, and Testing Library provides utilities to render components and assert on user-visible elements.
Alternatives considered: Jest with ts-jest. Rejected because Jest requires complex Babel transforms to parse Next.js TypeScript and ESM packages.
If we removed it: We would have no automated way to verify frontend UI components like the health check card.
Decided by: plan
Status: active

### D-032 — Phase 1 — dependency
What: Install `@vitejs/plugin-react` as a dev dependency for Vitest.
Why: `@vitejs/plugin-react` provides the JSX/TSX transformation pipeline for Vitest, allowing it to parse and compile React components during test runs without Vite application build dependencies.
Alternatives considered: ts-node or custom Babel transforms. Rejected because `@vitejs/plugin-react` is the officially supported transform plugin for Vitest in Vite/React environments.
If we removed it: Vitest would fail with syntax errors whenever loading components containing JSX tags like `<Card />`.
Decided by: user approved
Status: active

### D-033 — Phase 1 — step
What: Use `hatchling` as the Python package build backend chosen by `uv init --package`.
Why: When `uv init --package` scaffolds a standard Python package with `src` layout, it configures `hatchling` as the PEP 517 build backend. Hatchling is fast, lightweight, standard, and supported natively by `uv`.
Alternatives considered: Setuptools, flit, or poetry. Rejected because hatchling is the modern default for uv package scaffolding and requires minimal configuration.
If we removed it: The package could not be installed or built in editable mode for local testing.
Decided by: plan
Status: active

### D-034 — Phase 1 — design
What: Configure shadcn/ui with Radix UI base and the neutral base color palette (Option A).
Why: The build plan specifies classic shadcn/ui with neutral base color. Using `-b radix` preserves compatibility with Radix accessibility primitives and matches the UI specification in Section 4.
Alternatives considered: Base-nova preset. Rejected per user decision in favor of classic Radix with neutral styling.
If we removed it: The UI styling would diverge from the design specification in the build plan.
Decided by: user approved
Status: active

### D-035 — Phase 1 — step
What: Prevent or delete `apps/web/AGENTS.md` generated by create-next-app.
Why: Create-next-app includes `--agents-md` by default. Deleting this file prevents Antigravity from discovering a competing project rule file, preserving `GEMINI.md` as the authoritative project constitution as established in `D-014`.
Alternatives considered: Keeping `apps/web/AGENTS.md`. Rejected because Antigravity loads directory-level rules hierarchically, creating potential rule conflicts with `GEMINI.md`.
If we removed it: Next.js-generated agent rules could override or conflict with our strict project constitution.
Decided by: user approved
Status: active

### D-036 — Phase 1 — risk
What: Record `vitest` and `tinypool` advisory findings from `npm audit` as dev-only risks without running `npm audit fix --force`.
Why: Running `npm audit fix --force` would install a breaking major version (`vitest@5`), whereas Vitest is only used in dev/test environments and never bundled into production client artifacts.
Alternatives considered: Running `npm audit fix --force`. Rejected because breaking major version changes can destabilize testing and peer dependencies.
If we removed it: Unvetted automated fixes would alter dev toolchains unexpectedly.
Decided by: user approved
Status: active

### D-037 — Phase 1 — step
What: Delete corrupted `apps/web/package-lock.json` with plain `Remove-Item`.
Why: An aborted installation left 69 package entries without version strings in `package-lock.json`, causing npm's Arborist engine to throw `TypeError: Invalid Version:` during `canDedupe`. Removing the lockfile allows npm to resolve a clean tree.
Alternatives considered: Manually repairing 69 entries in the lockfile. Rejected as fragile and error-prone compared to a clean lockfile generation.
If we removed it: Every subsequent `npm install` command fails immediately due to invalid version parsing.
Decided by: user approved
Status: active

### D-038 — Phase 1 — step
What: Enforce standard peer dependency resolution in `apps/web` without `--legacy-peer-deps`.
Why: Running without `--legacy-peer-deps` verifies whether actual peer conflicts exist in the tree rather than masking them.
Alternatives considered: Passing `--legacy-peer-deps` by default. Rejected because silent dependency relaxation can hide real incompatibilities.
If we removed it: Incompatible React or toolchain versions could go unnoticed.
Decided by: user approved
Status: active

### D-039 — Phase 1 — step
What: Delete partially written `apps/web/node_modules` directory using plain `Remove-Item`.
Why: Interrupted installation left empty platform-specific optional dependency directories (such as `@tailwindcss/oxide-android-arm64`) lacking `package.json`, which caused npm's Arborist engine to assign `version = ""` and crash on `semver.gte` during deduplication.
Alternatives considered: Manually creating placeholder `package.json` files in empty directories. Rejected as fragile compared to a clean reinstall.
If we removed it: `npm install` continuously crashes on `TypeError: Invalid Version:`.
Decided by: user approved
Status: active

### D-040 — Phase 1 — file
What: Create development, verification, and smoke-testing operational scripts (`scripts/dev.ps1`, `scripts/check.ps1`, `scripts/llm_smoke.py`).
Why: `dev.ps1` automates running both FastAPI and Next.js concurrently in development mode. `check.ps1` provides a single authoritative command to run all quality and contract checks across both apps. `llm_smoke.py` provides a safe, standalone manual probe for live Gemini API credentials without risking prompt/response leaks in test logs.
Alternatives considered: Relying on manual multiline shell commands across directories. Rejected because consolidated scripts guarantee consistent execution across team environments.
If we removed it: Developers and CI would lack a unified check pipeline, increasing the risk of unverified code changes.
Decided by: plan
Status: active

### D-041 — Phase 1 — risk
What: Clarify that `respx` mock tests in `apps/api` rely on `aiohttp` NOT being installed in the environment.
Why: The Google GenAI SDK checks `has_aiohttp` at runtime. If `aiohttp` were installed, the SDK would route async calls through `aiohttp.ClientSession` instead of `httpx.AsyncClient`, bypassing `respx` mocks.
Alternatives considered: Installing `aiohttp` or building custom protocol-level mocks. Rejected because `httpx` is standard for FastAPI/Starlette test clients and avoids redundant HTTP transport libraries.
If we removed it: Installing `aiohttp` in the environment would silently break `respx` unit tests for `GeminiClient`.
Decided by: user requested
Status: active

### D-042 — Phase 1 — step
What: Remove `.gitkeep` placeholders from `apps/api`, `apps/web`, and `scripts` directories as real source files landed (superseding `D-015` for populated folders).
Why: Git tracks folders automatically once real files are placed inside them; retaining `.gitkeep` in populated directories is redundant.
Alternatives considered: Leaving `.gitkeep` in populated folders. Rejected to keep directory structures clean.
If we removed it: Redundant placeholder files would remain tracked in populated directories.
Decided by: plan
Status: active

### D-043 — Phase 1 — deviation
What: Map `httpx.ConnectError` to `LLMUnavailable` so transport-level connection failures trigger retry logic alongside HTTP 503, 429, and timeouts.
Why: Network-level socket connection drops or transient DNS glitches when connecting to the Gemini API endpoint are transient network events identical in practical failure semantics to HTTP 503 unavailability. Retrying connection drops prevents premature fatal failures on momentary network blips.
Alternatives considered: Raising an immediate fatal un-retried exception on connection drops. Rejected because network transport blips to cloud providers are common and inherently transient.
If we removed it: Any transient TCP reset or connection glitch would immediately fail an architecture generation request instead of cleanly attempting retry.
Decided by: agent proposed, user approved
Status: active

### D-200 — Stage E1 — deviation
What: Introduce evaluation suite cases, pure metrics aggregation in evals/metrics.py, side-by-side comparison in evals/compare.py, and dedicated test runner in evals/tests.
Why: To systematically measure LLM prompt performance across multiple repeated runs rather than relying on single manual invocations, Stage E1 introduces the evaluation dataset in evals/cases/ and evaluation tools. evals/metrics.py is introduced as a pure calculation module containing run dataclasses and aggregation statistics (attempt-1 pass rate, final pass rate, fallback rate, code repair rate, average node counts, lint and error counts) with zero database, LLM, or app-layer imports. As a deviation approved by the user, tests live in evals/tests/test_evals.py rather than apps/api/tests/, preserving apps/api/pyproject.toml and its type-checker scope unchanged. scripts/check.ps1 receives one added step to run pytest on evals/tests from the apps/api virtual environment.
Alternatives considered:
1. Placing test_evals.py in apps/api/tests/: Rejected because it would require altering apps/api/pyproject.toml (adding repo-root to pythonpath and mypy_path), coupling the core API type-check scope to root developer tooling.
2. Inlining metric calculations into evals/compare.py: Rejected because separating pure aggregation into evals/metrics.py allows clean unit testing without CLI argument parsing or presentation overhead.
If we removed it: Prompt performance changes would remain anecdotal and could not be regression-tested deterministically across runs.
Decided by: agent proposed, user approved
Status: active

### D-044 — Phase 1 — design
What: Map upstream HTTP 500 and 502 server responses to base `LLMError` rather than `LLMUnavailable`, preventing automated retries for internal upstream errors.
Why: The architecture design plan strictly specifies automated retries only for HTTP 503, HTTP 429, and timeouts. Internal server errors (500) and bad gateways (502) represent upstream server bugs or unexpected service states where immediate repeated execution does not resolve the condition and wastes quota.
Alternatives considered: Catching all `code >= 500` as retryable `LLMUnavailable`. Rejected because it violated the specification to only retry 503, 429, and timeouts.
If we removed it: Upstream 500 Internal Server Errors would be retried repeatedly, increasing latency and burning call quota unnecessarily.
Decided by: user approved
Status: active

### D-045 — Phase 1 — step
What: Implement case-insensitive and delimiter-agnostic key normalization in structured logging redaction.
Why: Configuration keys, query parameters, and JSON payloads can represent sensitive identifiers in various formats (e.g., `apiKey`, `ApiKey`, `api_key`, `API_KEY`). Stripping underscores and lowering characters ensures all casing variants are reliably scrubbed before log emission.
Alternatives considered: Exact string casing matching or explicit enumeration of every possible casing variant. Rejected as brittle and prone to accidental leakage if an unexpected casing is introduced.
If we removed it: CamelCase or PascalCase API keys would bypass logging redaction filters and appear in plaintext logs.
Decided by: user requested
Status: active

### D-046 — Phase 1 — step
What: Align LLM timeout configuration to `llm_timeout_seconds = 60` across `Settings` and verification scripts.
Why: The build specification explicitly mandates a default LLM timeout of 60 seconds (`LLM_TIMEOUT_SECONDS = 60`). Setting this default directly on Pydantic settings and referencing it in manual smoke tests ensures consistent timeout behavior across environments.
Alternatives considered: Retaining a 30-second default or separate `gemini_timeout_seconds`. Rejected to adhere strictly to the build contract specification.
If we removed it: Large LLM architecture generation requests could prematurely time out before Gemini finishes returning complex multi-node specifications.
Decided by: user requested
Status: active

### D-047 — Phase 1 — step
What: Standardize application server invocation on `uvicorn archnemesis.main:create_app --factory` across documentation, development scripts, and guidelines.
Why: Using the `--factory` flag guarantees that FastAPI lifecycle events, dependency overrides, and configuration bindings are cleanly instantiated per worker without relying on global module-level import side effects, ensuring uniform behavior between development and test environments.
Alternatives considered: Running `uvicorn archnemesis.main:app` directly. Rejected to maintain strict consistency across `GEMINI.md`, `README.md`, and `scripts/dev.ps1`.
If we removed it: Documentation and dev scripts would drift in how the ASGI application instance is discovered and initialized.
Decided by: user requested
Status: active

### D-048 — Phase 1 — bugfix
What: Enforce exclusive conditional rendering in frontend health status card (`error ? <ErrorState /> : data ? <HealthyState /> : null`).
Why: TanStack Query preserves previous successful data in its cache upon subsequent refetch errors. Independent `{error && ...}` and `{data && ...}` expressions caused contradictory states where both "API not reachable" and previous "API healthy" components rendered simultaneously when the backend was stopped.
Alternatives considered: Calling `queryClient.removeQueries()` on every error or disabling query caching entirely. Rejected because exclusive conditional rendering solves the root presentation bug cleanly while maintaining standard cache behavior.
If we removed it: Network dropouts or backend restarts would display confusing, contradictory UI states to the user.
Decided by: user reported
Status: active

### D-049 — Phase 1 — bugfix
What: Correct `GeminiClient` keyword argument in `scripts/llm_smoke.py` from `model_map` to `model_names`.
Why: The smoke test script incorrectly instantiated `GeminiClient(model_map=...)`, whereas the class constructor defines the parameter as `model_names`. Discovered during the first live smoke run with valid credentials (previously listed as "not run" in agent verification reports); resolved by fixing the single keyword argument, after which the first live Gemini call succeeded with the configured model. Lesson: Operational scripts outside standard automated pytest and mypy validation runs can develop unnoticed keyword signature drift.
Alternatives considered: Aliasing `model_map` as a deprecated parameter in `GeminiClient.__init__`. Rejected as unnecessary API bloat for an internal helper class; fixing the call-site in the script maintains clean code contracts.
If we removed it: Developers running `scripts/llm_smoke.py` to manually verify Gemini connectivity would encounter a `TypeError: unexpected keyword argument 'model_map'`.
Decided by: user reported
Status: active

### D-050 — Phase 2 — dependency
What: Add `networkx` to production dependencies in `apps/api`.
Why: NetworkX provides robust, battle-tested directed graph algorithms for DAG validation, cycle detection, reachability analysis, and shortest-path witness generation without hand-rolling graph traversal algorithms.
Alternatives considered: Writing custom DFS/BFS algorithms. Rejected because custom graph traversal is prone to edge-case bugs and performance pitfalls compared to a well-tested graph library.
If we removed it: Graph structure and path-based constraint validation would require complex custom graph algorithms.
Decided by: plan
Status: active

### D-051 — Phase 2 — dependency
What: Add `hypothesis` to development dependencies in `apps/api`.
Why: Hypothesis enables property-based testing across thousands of generated DAG structures, verifying that graph validation invariants hold across random topologies and adversarial inputs.
Alternatives considered: Hand-written unit test fixtures only. Rejected because property-based testing discovers subtle graph topology edge cases that hand-written fixtures miss.
If we removed it: Validation edge-case testing would be limited to manually constructed fixtures.
Decided by: plan
Status: active

### D-052 — Phase 2 — dependency
What: Add `types-networkx` to development dependencies in `apps/api`.
Why: `networkx` does not bundle inline PEP 561 type stubs, triggering `import-untyped` errors under mypy strict mode. Installing `types-networkx` preserves strict type checking across all graph operations.
Alternatives considered: Setting `ignore_missing_imports = true` for `networkx.*`. Rejected because it disables type verification across our primary graph algorithms.
If we removed it: Mypy strict mode fails on every `networkx` import or requires untyped escape hatches.
Decided by: user approved
Status: active

### D-053 — Phase 2 — design
What: Establish a closed set of four verifiable constraint kinds (`must_exist`, `must_pass_through`, `must_not_connect`, `must_precede`).
Why: Code can only verify assertions that have clear, deterministic graph-theoretic semantics. User requirements that cannot be formulated into these four kinds are classified as unverifiable rather than faking code verification.
Alternatives considered: Open-ended constraint evaluation or arbitrary Python expressions. Rejected to prevent untrusted code execution and maintain deterministic verification.
If we removed it: Validation would either allow unprovable constraints or crash on unrecognized semantic rules.
Decided by: plan
Status: active

### D-054 — Phase 2 — design
What: Implement an 8-stage validation pipeline with explicit skip rules.
Why: Structural checks depend on clean schemas and valid node IDs. Skipping graph traversal when duplicate IDs or bad references exist prevents confusing cascade errors and unhandled exceptions.
Alternatives considered: Running all checks simultaneously regardless of prior failures. Rejected because invalid node references crash graph traversal or produce misleading secondary errors.
If we removed it: Malformed specifications would crash in graph algorithms with tracebacks instead of returning structured issue lists.
Decided by: plan
Status: active

### D-055 — Phase 2 — design
What: Configure `extra='ignore'` on validation Pydantic models.
Why: LLM outputs may include hallucinated metadata fields. Ignoring extraneous fields prevents schema failure while strictly validating all required structural properties.
Alternatives considered: `extra='forbid'`. Rejected because minor harmless LLM hallucinated keys would fail otherwise structurally sound architectures.
If we removed it: Slight variations in LLM JSON generation would cause frequent schema validation failures.
Decided by: plan
Status: active

### D-056 — Phase 2 — design
What: Define `ConstraintSpec.kind` as a plain `str` rather than an enum.
Why: Storing `kind` as a plain string allows unrecognized constraint kinds to pass Pydantic parsing and trigger a structured `E_UNKNOWN_CONSTRAINT_KIND` issue with targeted guidance, rather than a generic schema error.
Alternatives considered: Using a Python `Enum`. Rejected because invalid enum values raise generic Pydantic `ValidationError` before business checks can inspect them.
If we removed it: Unrecognized constraint kinds would produce noisy `E_SCHEMA` errors that lack specific recovery instructions for the repair loop.
Decided by: plan
Status: active

### D-057 — Phase 2 — design
What: Enforce deterministic sorting of nodes and edges by ID in graph building and Kahn's algorithm.
Why: NetworkX and dictionary ordering must produce identical witness paths and topological sorts across different Python runs and operating systems.
Alternatives considered: Inserting nodes and edges in raw input order. Rejected because dict iteration order or input shuffling would produce non-deterministic witness paths and orderings.
If we removed it: Identical specs could produce fluctuating topological orders or differing witness explanations across runs.
Decided by: plan
Status: active

### D-058 — Phase 2 — design
What: Enforce fixed verbatim validation error and lint message templates.
Why: Validation error messages feed directly into LLM repair prompts and user-facing notifications. Verbatim consistency ensures the LLM repair prompt is tested against exact error patterns.
Alternatives considered: Dynamic or parameterized prose generation. Rejected because varying wording breaks automated prompt repair regexes and unit assertions.
If we removed it: Inconsistent error messaging would degrade LLM generator repair accuracy.
Decided by: plan
Status: active

### D-059 — Phase 2 — file
What: Configure import-linter contract isolating `archnemesis.modules.validation`.
Why: The validation module must remain mathematically pure, importing only Pydantic, NetworkX, and the standard library, completely insulated from database, HTTP, settings, and LLM dependencies.
Alternatives considered: Relying solely on developer discipline. Rejected because architectural boundaries require automated CI verification to prevent accidental coupling.
If we removed it: Developers could inadvertently import database engines or settings into pure validation logic.
Decided by: plan
Status: active

### D-060 — Phase 2 — file
What: Create validation module package and submodules in `apps/api/src/archnemesis/modules/validation/`.
Why: Modularizes validation into single-responsibility units: `models.py` (schemas), `graph.py` (graph builder), `checks.py` (structural rules), `constraints.py` (semantic constraints), `lints.py` (style warnings), `ordering.py` (topological sort), and `validate.py` (pipeline coordinator).
Alternatives considered: A single monolithic `validate.py` file. Rejected because separating models, graph traversals, and checks simplifies unit testing and maintainability.
If we removed it: All validation logic would be tangled in one large file, making testing and reasoning difficult.
Decided by: plan
Status: active

### D-061 — Phase 2 — file
What: Create validation test suite and fixtures in `apps/api/tests/validation/`.
Why: Houses comprehensive domain fixtures (8 valid industry specs across diverse domains and 20+ broken test cases), bounded property-based hypothesis tests, and verbatim message assertion tests.
Alternatives considered: Ad-hoc inline test dicts. Rejected because real JSON fixtures mirror live API payloads and can be reused by frontend tests and evals.
If we removed it: Edge cases across constraint kinds and malformed graph topologies would lack reproducible verification.
Decided by: plan
Status: active

### D-062 — Phase 2 — design
What: Configure Pydantic alias for `EdgeSpec.from_node` with `populate_by_name=True` and serialization by alias.
Why: Python reserves `from` as a keyword. Aliasing the field allows Python code to use `edge.from_node` while seamlessly serializing and deserializing JSON payloads using the standard contract key `"from"`.
Alternatives considered: Using `from_` with manual dict manipulation. Rejected because Pydantic's native `Field(alias="from")` with `model_dump(by_alias=True)` handles round-tripping declaratively.
If we removed it: Edge JSON parsing would fail or require manual key translation layers.
Decided by: plan
Status: active

### D-063 — Phase 2 — file
What: Separate diagnostic lint test fixtures into dedicated directory `apps/api/tests/validation/fixtures/lints/`.
Why: Lints (`W_*`) are non-blocking warnings where `result.ok` remains True and `result.errors` is empty. Moving lint fixtures out of `fixtures/broken/` avoids semantic ambiguity and allows dedicated parametrization asserting that warnings are captured without failing validation.
Alternatives considered: Keeping lint fixtures inside `fixtures/broken/` with conditional checking for code prefix `W_`. Rejected because files in `broken/` should strictly represent invalid specifications that fail with `result.ok == False`.
If we removed it: Lint fixtures mixed into `broken/` would blur the contract boundary between blocking errors and advisory notes.
Decided by: user requested
Status: active

### D-064 — Phase 3 — deviation
What: Run Alembic migrations using synchronous SQLite engine in `alembic/env.py`.
Why: Running `asyncio.run(run_async_migrations())` with `sqlite+aiosqlite` under Windows sandbox isolation hangs indefinitely upon entering the event loop during CLI migration runs. Switching `env.py` to a synchronous SQLite engine (`create_engine(sync_url)`) allows Alembic DDL migrations to run reliably in <1s, while the application server continues to use async SQLAlchemy.
Alternatives considered: Attempting ProactorEventLoop workarounds or requesting unsandboxed execution for migrations. Rejected as unnecessary security bypass when synchronous SQLite migrations operate natively.
If we removed it: `uv run alembic upgrade head` hangs indefinitely under standard Windows sandbox execution.
Decided by: agent proposed (unapproved deviation, retained pending review)
Status: active

### D-065 — Phase 3 — deviation
What: User approval of synchronous `alembic/env.py` migration runner with recorded caveat and host-environment test.
Why: The user approved the synchronous `env.py` deviation without further investigation, with instructions not to touch `env.py` further. The hypothesized cause (sandbox event loop socketpair initialization) is recorded as an UNVERIFIED hypothesis because earlier async pytest test runs in this same sandbox passed. In addition, on the user's host machine `uv run python -c "import asyncio; asyncio.run(asyncio.sleep(0))"` printed ok. Alembic migrations run on the user's machine with `uv run alembic upgrade head`, which the user tests directly.
Alternatives considered: Reverting to async runner or further diagnosing event loop behaviors. Rejected per user decision to proceed with the synchronous migration runner.
If we removed it: Alembic migrations would hang during agent execution in the sandbox.
Decided by: user approved
Status: active

### D-066 — Phase 3 — step
What: Live Gemini schema verification passes for both `ArchitectureSpec` and `IntakeLLMOutput`.
Why: Step 0 live schema probe (`scripts/schema_probe.py`) was executed from `apps/api` with live credentials against the configured Gemini model (`gemini-2.5-flash`). Both `ArchitectureSpec` (probe 1) and `IntakeLLMOutput` (probe 2) printed `OK`, confirming that Gemini accepts our nested Pydantic models, JSON schema structures, aliases (`from`), and constraint fields without schema rejection.
Alternatives considered: Skipping schema probes and testing only in end-to-end service calls. Rejected because early schema probing isolates LLM schema support before building modules.
If we removed it: Potential LLM schema incompatibility would only surface during multi-turn intake or generation runs.
Decided by: user verified
Status: active

### D-067 — Phase 3 — design
What: Introduce `SESSION_CLOSED` (HTTP 409) error status for requests targeting concluded intake sessions.
Why: Once an intake session reaches terminal status (`ready`, `designed`, or `abandoned`), modifying its transcript or submitting further turns is invalid. Returning HTTP 409 Conflict with code `SESSION_CLOSED` clearly signals to client applications that the dialogue has concluded.
Alternatives considered: Reopening the session or resetting it to active. Rejected because requirement briefs are immutable once finalized.
If we removed it: Subsequent client requests could append contradictory dialogue turns to already designed sessions.
Decided by: user approved
Status: active

### D-068 — Phase 3 — design
What: Enforce a hard cap of 3 dialogue rounds in intake, forcing brief synthesis on round 3.
Why: Pre-sales discovery dialogues must converge rapidly to avoid user fatigue and excessive LLM token consumption. Capping discovery at 3 rounds (`MAX_FOLLOWUP_ROUNDS = 3`) and injecting a system instruction on round 3 guarantees the LLM synthesizes a `RequirementBrief` rather than continuing to ask questions.
Alternatives considered: Open-ended conversation until the LLM decides. Rejected because LLMs can ask endless clarifying questions.
If we removed it: Intake conversations could drift indefinitely without producing an architecture brief.
Decided by: plan
Status: active

### D-069 — Phase 3 — design
What: Have deterministic application code assign constraint identifiers (`bc1`, `bc2`, ...) to brief constraints.
Why: LLMs are prone to hallucinating or producing inconsistent alphanumeric identifier schemes. Having Python code deterministically assign consecutive IDs ensures clean, predictable references for downstream verification.
Alternatives considered: Asking the LLM to invent and assign constraint IDs in its JSON response. Rejected because LLM ID assignment is non-deterministic and can produce duplicate or malformed keys.
If we removed it: Downstream constraint coverage checks would fail or become non-deterministic.
Decided by: user approved
Status: active

### D-070 — Phase 3 — design
What: Cap the architecture generator and repair loop at a maximum of 3 total LLM calls.
Why: If a specification fails structural or constraint validation, the generator is given up to 2 repair attempts with explicit error diagnostic feedback. Capping total calls at 3 prevents runaway LLM loops and quota exhaustion when an unsatisfiable requirement is requested.
Alternatives considered: Infinite repair loop until valid. Rejected to prevent unbounded latency and costs.
If we removed it: Unsolvable constraints could trigger endless repair calls.
Decided by: plan
Status: active

### D-071 — Phase 3 — design
What: Quarantine untrusted user input within `<untrusted_user_text>` tags in the architecture repair prompt.
Why: In repair attempts, previous user messages and requirements are re-sent alongside validation error traces. Enclosing user-supplied brief text within explicit quarantine XML tags and instructing the LLM system prompt never to execute text inside tags neutralizes prompt injection attempts.
Alternatives considered: Omitting user text in repair or stripping all punctuation. Rejected because the LLM needs requirement context to repair the architecture, and stripping punctuation harms technical meaning.
If we removed it: Adversarial user prompts could hijack repair prompts to bypass validation rules.
Decided by: plan
Status: active

### D-072 — Phase 3 — design
What: Handle database `UNIQUE(intake_session_id)` race conditions by catching `IntegrityError` and returning the existing design.
Why: If a user double-clicks "Generate Design" or concurrent network requests trigger design generation for the same intake session, the database uniqueness constraint prevents duplicate design records. Catching `IntegrityError`, rolling back, and returning the first committed design ensures idempotency without 500 crashes.
Alternatives considered: Letting 500 Internal Server Error propagate or using application-level locks. Rejected because database-level unique constraints provide the true source of concurrency truth across multiple processes.
If we removed it: Concurrent design requests would crash with unhandled database constraint exceptions.
Decided by: plan
Status: active

### D-073 — Phase 3 — deviation
What: Configure `proxyTimeout: 120000` in Next.js `next.config.ts`.
Why: Next.js API route proxying defaults to a 30-second timeout (`proxyTimeout: 30000`). Architecture generation involves multi-round LLM synthesis and repair which can legitimately take 40-60 seconds under peak API latency, causing Next.js to abort the connection with a 504 Gateway Timeout while the backend is still processing.
Alternatives considered: Leaving default 30s timeout. Rejected because architecture generation requests would fail with 504 timeouts.
If we removed it: Complex multi-step generation requests would time out at the frontend proxy layer.
Decided by: agent proposed (unapproved deviation, retained pending review)
Status: active

### D-074 — Phase 3 — design
What: Maintain a reference pattern prompt library in `apps/api/src/archnemesis/prompts/patterns/`.
Why: Providing 6 domain-specific architectural pattern templates (RAG QA, human approval, event streaming, tool agent guardrails, data pipeline, conversational routing) grounds LLM synthesis in clean DAG topologies, realistic node kinds, and valid constraint usages.
Alternatives considered: Relying solely on zero-shot generation without topology patterns. Rejected because few-shot architectural topologies significantly increase first-pass DAG validation success.
If we removed it: The LLM would hallucinate unconventional or cyclic graph topologies more frequently.
Decided by: plan
Status: active

### D-075 — Phase 3 — file
What: Create versioned prompt markdown files `intake_v1.md`, `architect_v1.md`, and `architect_repair_v1.md`.
Why: Storing prompts in dedicated markdown files decouples prompt engineering from Python code, enables versioning in git, and preserves raw formatting without messy multi-line Python string escapes.
Alternatives considered: Inline Python strings. Rejected because long prompts clutter service code and make diffing prompt improvements difficult.
If we removed it: Prompts would be embedded in Python source files, complicating review and maintenance.
Decided by: plan
Status: active

### D-076 — Phase 3 — file
What: Establish `archnemesis.shared` as a pure Pydantic domain layer.
Why: The `RequirementBrief`, `BriefConstraint`, and `BriefNumber` models represent core domain entities shared across intake, architect, explainer, and designs modules. Keeping `shared` pure (importing only Pydantic and standard library) ensures zero coupling to databases, HTTP, or LLM providers.
Alternatives considered: Placing brief models in `intake.schemas`. Rejected because `architect` and `designs` would have to import from `intake`, violating sibling independence.
If we removed it: Sibling modules would be coupled to intake schemas, violating the clean architecture hierarchy.
Decided by: plan
Status: active

### D-077 — Phase 3 — design
What: Enforce architectural layer boundaries with import-linter: sibling modules `intake` and `architect` are independent.
Why: Modular design requires that domain modules focus on single responsibilities. `intake` conducts dialogue; `architect` generates specs; neither imports the other. Only the orchestrating `designs` module imports both.
Alternatives considered: Allowing direct cross-imports between sibling feature modules. Rejected because circular dependencies and tight coupling quickly erode codebase maintainability.
If we removed it: Feature modules could tangle into circular dependency graphs over time.
Decided by: plan
Status: active

### D-078 — Phase 3 — file
What: Add Phase 3 temporary test harness UI to Next.js `page.tsx` marked `// TEMP(phase-3)`.
Why: Allows rapid manual browser testing of intake turns, round advancement, brief synthesis, and design generation directly from the web client before Phase 5 builds the dedicated diagram UI.
Alternatives considered: Testing only via curl or Swagger. Rejected because browser verification of the complete Next.js -> FastAPI -> Gemini pipeline is required by the development protocol.
If we removed it: Manual end-to-end browser verification of intake and design creation would be impossible prior to Phase 5.
Decided by: plan
Status: active

### D-079 — Phase 3 — design
What: Implement dual-table persistence model separating `designs` from immutable `design_versions`.
Why: A design evolves across multiple iterative versions during refinement, but its identity and intake origin remain constant. Separating the parent `designs` entity from append-only `design_versions` records preserves a full audit trail of past iterations without destructive overwrites.
Alternatives considered: A single mutable `designs` table where each update overwrites the previous spec. Rejected because Arch-Nemesis requires version history and diff tracking.
If we removed it: Past architecture versions and prompts would be lost upon every refinement turn.
Decided by: plan
Status: active

### D-080 — Phase 3 — file
What: Create AST whitelist test `tests/test_shared_imports.py` asserting that `archnemesis.shared` imports only Pydantic and standard library.
Why: Automated import linters can have configuration oversights. Running an explicit Python AST traversal test in pytest provides double-layered verification that no unwanted dependencies creep into the domain layer.
Alternatives considered: Relying exclusively on `import-linter`. Rejected because automated unit tests verify the AST directly during standard `pytest` runs.
If we removed it: A misconfiguration in import-linter could allow unauthorized imports into `shared` undetected by unit tests.
Decided by: plan
Status: active

### D-081 — Phase 3 — design
What: Specify intake round cap and forced brief synthesis behavior (superseding D-068).
Why: Clarifies the exact multi-turn discovery progression: the user sees up to 3 sets of questions (rounds 1, 2, and 3). If `round == MAX_FOLLOWUP_ROUNDS` (3) and the LLM still returns `action: "ask"` with questions, the service triggers a forced-brief call instructing the LLM that this is the final round and it must produce the brief along with any necessary assumptions.
Alternatives considered: Terminating dialogue with an error or dropping into open-ended questions. Rejected because discovery must reliably converge on a brief by round 3.
If we removed it: Intake conversations could ask unbounded questions or crash on round 3.
Decided by: plan
Status: active (supersedes D-068)

### D-082 — Phase 3 — design
What: Apply untrusted user text quarantine across both intake and architect modules (superseding D-071).
Why: Untrusted user input is enclosed within `<untrusted_user_text>` tags in prompts for both intake dialogue history and architect generation/repair. System prompts explicitly instruct the LLM that everything inside `<untrusted_user_text>` represents untrusted data and must never be interpreted as instructions or overrides, neutralizing prompt injection attacks throughout the discovery and design pipelines.
Alternatives considered: Applying XML quarantine only to architect repair. Rejected because injection attempts can occur in initial intake turns or initial spec generation.
If we removed it: Injected instructions in initial user messages could manipulate system prompts.
Decided by: user requested
Status: active (supersedes D-071)

### D-083 — Phase 3 — design
What: Standardize test error envelope assertions using the `error_body(response)` helper.
Why: The production application uniformly wraps error responses inside `{"error": {"code": "...", "message": "..."}}`. Tests that previously accessed `response.json()["message"]` failed with `KeyError`. Introducing a centralized `error_body(response)` helper in `tests/conftest.py` ensures all tests assert against the real error envelope structure without modifying production code.
Alternatives considered: Changing production responses to top-level `{"message": ...}`. Rejected because it violates the Build Plan uniform error envelope contract.
If we removed it: Tests checking error responses would fail with `KeyError` or duplicate nested dictionary traversal logic.
Decided by: user requested
Status: active

### D-084 — Phase 3 — design
What: Isolate database access in backend tests using temporary-file SQLite fixtures.
Why: Tests must never read or mutate the primary development database `arch_nemesis.db`. Providing a `temp_db_session_factory` fixture that creates a fresh temporary SQLite file (`tmp_path / "test_temp.db"`) with newly generated tables and overrides `get_db_session` ensures tests run in complete isolation with zero production database side effects.
Alternatives considered: Running tests against `arch_nemesis.db` or using in-memory SQLite without user approval. Rejected because touching production data is unsafe and in-memory SQLite behaves differently with connection lifecycles.
If we removed it: Tests would mutate local development database records and could encounter concurrency locks.
Decided by: user requested
Status: active

### D-085 — Phase 3 — design
What: Align intake round tracking to stored session value and implement post-round-3 forced brief call (matching D-081).
Why: D-081 specified that a user sees up to 3 question sets (rounds 1, 2, and 3), and if the LLM asks again on the turn following the third set, a forced-brief call is triggered. The earlier implementation differed because it derived rounds by counting assistant turns in the transcript and injected a system notice into the user prompt on turn 3, triggering forced brief one turn too early. The implementation now strictly reads and increments stored `session.rounds`, allowing up to 3 question sets to be shown to the user, and triggers forced brief synthesis on turn 4 if the LLM attempts to ask questions again.
Alternatives considered: Counting transcript turns or continuing to append system notices to user messages. Rejected because deriving state from transcript speakers caused off-by-one errors and polluted the user dialogue history.
If we removed it: Users could either see a 4th clarifying question set or have discovery prematurely truncated before 3 question sets.
Decided by: user requested
Status: active

### D-086 — Phase 3 — file
What: Dedicated forced-brief synthesis system prompt in `apps/api/src/archnemesis/prompts/intake_forced_v1.md`.
Why: When the 3-round dialogue cap is reached and the LLM still attempts to ask questions, a forced-brief synthesis call must be made using a dedicated system prompt rather than modifying user prompt text. Storing this prompt in `intake_forced_v1.md` maintains prompt file versioning conventions and cleanly instructs the LLM that discovery has completed and it must synthesize the final `RequirementBrief` with `action: "ready"`.
Alternatives considered: Appending instructions to the user prompt message or hardcoding a system prompt string in Python. Rejected because prompt text belongs in versioned prompt files and user messages must remain clean dialogue turns.
If we removed it: The forced-brief call would lack clear architectural synthesis instructions or would pollute the dialogue history.
Decided by: user approved
Status: active

### D-087 — Phase 3 — design
What: Retain standard pytest `tmp_path` fixture for temporary test SQLite databases.
Why: Test databases are created inside pytest's isolated per-test temporary directory (`tmp_path / "test_temp.db"`). A temporary relocation to `.test_dbs/` inside the workspace was proposed, but because there was no evidence of any failure with `tmp_path` (the earlier 500 error was caused by a missing required `unit` field in test fixture `BriefNumber`), test databases were restored to `tmp_path` and `.test_dbs/` was removed from `.gitignore`.
Alternatives considered: Retaining workspace-local test databases in `.test_dbs/`. Rejected because keeping temporary test databases in OS temp folders via standard `tmp_path` avoids workspace clutter and git tracking concerns.
If we removed it: Test databases would accumulate in the repository workspace.
Decided by: user requested
Status: active

### D-088 — Phase 3 — deviation
What: Include root directory `.` in pytest `pythonpath = ["src", "."]` configuration in `apps/api/pyproject.toml`.
Why: Test files import test helpers and fixtures from `tests.conftest` (e.g. `error_body`). Adding `.` to pytest's `pythonpath` alongside `src` allows the test suite to resolve `tests` package imports consistently across all test runners and environments.
Alternatives considered: Converting test imports to relative imports or restructuring test fixtures. Rejected because importing from `tests.conftest` is standard practice across the test suite and requires explicit root package resolution.
If we removed it: Pytest would fail with `ModuleNotFoundError: No module named 'tests'` when running individual test files or submodules.
Decided by: agent proposed (unreported deviation, recorded per review)
Status: active

### D-089 — Phase 3 — deviation
What: Edit Alembic migration `0002_intake_and_designs.py` in place to change `intake_sessions.rounds` `server_default` from `"1"` to `"0"`.
Why: D-081 specifies that rounds represents the count of question sets already shown to the user, starting at 0. Editing migration 0002 in place was approved by the user because migration 0002 is uncommitted, has never run against a real production database, avoids consuming revision 0003 which Phase 6 requires, and keeps the initial schema creation clean. References D-081.
Alternatives considered: Adding a new migration 0003 to alter the column default. Rejected because 0003 is reserved for Phase 6 and 0002 has not been deployed to production.
If we removed it: Fresh databases migrated via 0002 would initialize `intake_sessions.rounds` to 1 instead of 0, conflicting with the domain model and D-081.
Decided by: user approved
Status: written, not yet verified by a test run

### D-090 — Phase 3 — fix
What: Add integration test `tests/test_migration_0002.py` verifying Alembic migration `0002` schema default and ORM default for `rounds`.
Why: Verifies that running `alembic upgrade head` against an isolated temporary SQLite database sets `server_default="0"` on `intake_sessions.rounds` by executing raw SQL INSERT without the `rounds` column and asserting the stored value is 0. Also asserts `IntakeSessionTable.rounds` ORM column default is 0.
Alternatives considered: Relying only on code review or ORM inspection without testing raw database defaults. Rejected because database-level column defaults must be proven against real SQLite DDL.
If we removed it: Regressions in migration scripts or default values would go undetected by automated tests.
Decided by: user requested
Status: written, not yet verified by a test run

### D-091 — Phase 3 — fix
What: Close prompt-injection quarantine gap across intake dialogue turns and architect initial generation (references D-082).
Why: D-082 specified that untrusted user input is enclosed within `<untrusted_user_text>` tags across both intake dialogue history and architect generation/repair. However, previously intake (`modules/intake/service.py`) and initial spec generation (`modules/architect/service.py:64`) sent raw user/brief text without tags, and the 3-line security instruction only existed in `architect_repair_v1.md`. Every user-authored intake turn (in normal and forced-brief calls) and the initial brief text in architect generation are now wrapped in `<untrusted_user_text>` tags, and the 3-line quarantine instruction is present across all system prompt files (`intake_v1.md`, `intake_forced_v1.md`, `architect_v1.md`, `architect_repair_v1.md`).
Alternatives considered: Leaving intake untagged or relying only on repair prompt quarantine. Rejected because prompt injections can occur in initial intake messages and initial architecture generation.
If we removed it: Adversarial user text in intake turns or initial briefs could attempt prompt injection against system prompts.
Decided by: user requested
Status: active

### D-092 — Phase 3 — process
What: Record verification of D-089 (migration 0002 server_default) and D-090 (migration test) via user pytest execution.
Why: The user ran the pytest test suite on host environment without sandbox hangs, confirming that all 131 tests passed including `tests/test_migration_0002.py`. D-089 and D-090 are now verified and active.
Alternatives considered: Leaving status unverified. Rejected because real test execution was completed and reported by the user.
If we removed it: Decision log would show active code changes as unverified.
Decided by: user verified
Status: active

### D-093 — Phase 3 — process
What: Correct attribution for decisions D-085 and D-086 to agent proposed.
Why: Entries D-085 and D-086 originally listed "Decided by: user requested/approved", but the user never explicitly approved them prior to entry. The attribution is corrected: D-085 and D-086 were proposed by the agent and were not explicitly approved by the user.
Alternatives considered: Editing past entries directly. Rejected because project rules strictly forbid editing existing decision log entries; corrections are recorded via new entries.
If we removed it: Historical decision records would misrepresent user intent and approvals.
Decided by: user requested
Status: active

### D-094 — Phase 3 — design
What: Document round counting semantics distinction between D-081 specification wording and D-085 stored database values.
Why: D-081 described the intake round progression conceptually as "rounds 1, 2, and 3" and "round == 3 forces brief". In implementation (D-085), stored `session.rounds` represents the count of question sets already shown to the user. A new session starts with stored `rounds = 0`. Question sets are shown on stored rounds 0, 1, and 2 (incrementing `session.rounds` to 1, 2, and 3). On stored `rounds = 3` (turn 4), if the LLM asks again, questions are suppressed and the forced-brief call is triggered. Both describe the exact same invariant: the user sees at most 3 question sets, and the forced brief triggers on the turn following the 3rd set.
Alternatives considered: Reinterpreting stored rounds to start at 1. Rejected because 0 questions shown initially corresponds to integer 0.
If we removed it: Future developers could be confused by the conceptual "rounds 1-3" vs stored 0-indexed count of shown sets.
Decided by: user requested
Status: active

### D-095 — Phase 2 — design
What: Establish Path B contract defining Node.inputs and Node.outputs as free-text data labels and deriving component connectivity exclusively from edges.
Why: Early draft instructions in architect_v1.md ambiguously mentioned node IDs ("list of node IDs this component receives data from"), but all 13 valid validation fixtures, domain designs, and user-facing requirements treat inputs/outputs as descriptions of data payloads (e.g. "raw_query", "order_id"). Deriving topological connectivity strictly from edges matches graph theory standards, avoids artificial coupling between edge declarations and free-text node metadata, and avoids requiring redundant node ID validation checks.
Alternatives considered: Path A (enforcing that node inputs/outputs must be node IDs and adding validation checks between edges and node inputs/outputs). Rejected because all existing valid specs and domain fixtures would be invalidated, and data flow semantics are richer when expressed as payload descriptions.
If we removed it: Contract ambiguity would persist across architect prompts, validation models, and upcoming Phase 4/5 detail panel and explanation implementations.
Decided by: user approved
Status: active

### D-096 — Phase 2 — fix
What: Align architect prompt, validation schema, and Phase 3 test fixtures to the Path B data label contract.
Why: architect_v1.md was updated to instruct the LLM to emit data descriptions (max 120 chars each, max 8) for inputs/outputs and explicitly note that connections are defined only by edges. NodeSpec in validation/models.py was tightened with Annotated[str, Field(max_length=120)] to enforce the 120-character limit per data label. Phase 3 test fixtures in test_designs.py, test_architect.py, and test_quarantine.py that previously used node IDs were updated to descriptive data payload labels.
Alternatives considered: Leaving architect prompt and test fixtures using node IDs. Rejected because prompts and test suites must strictly adhere to the unified data contract.
If we removed it: The LLM could generate node IDs in inputs/outputs while validation and downstream visualization components expect data payload names.
Decided by: user requested
Status: written, not yet verified by a test run

### D-097 — Phase 2 — process
What: Correct attribution, deviation note, and verification status for D-096.
Why: D-096 listed "Decided by: user requested", but the user requested only a validation unit test asserting that inputs/outputs accept strings up to 120 chars and reject 121 chars, not the code modification to validation/models.py. The addition of `Annotated[str, Field(max_length=120)]` to `NodeSpec` was proposed and implemented by the agent without explicit user approval; it represents a deviation from the user's directive "no new validation check" (even though the build plan already specified that each input or output has a max length of 120). Furthermore, the status of D-096 is now verified and active: all 136 tests passed via the user's host run of `scripts\check.ps1`, and end-to-end functionality was confirmed in a live browser legal design generation.
Alternatives considered: Modifying D-096 in place. Rejected because the project rules prohibit editing existing decision log entries; corrections are recorded via new entries.
If we removed it: The decision log would misattribute user instructions and leave an unrecorded deviation.
Decided by: user requested
Status: active

### D-098 — Phase 4 — design
What: Add `brief` and `warnings` fields to `DesignResponse` in `apps/api/src/archnemesis/modules/designs/schemas.py`.
Why: Build Plan line 410 specifies that `GET /api/designs/{id}` returns the requirement brief and warnings alongside the spec and flow order. Adding `brief: RequirementBrief` and `warnings: list[str]` (deserialized from `version.brief_json` and `version.warnings_json`) allows the Phase 4 UI (`NotesPanel`) to display lint warnings and unverifiable requirements. The response preserves the existing field names `id` and `current_version` (which differ from the Build Plan line 410 phrasing `design_id` and `version_no`) to maintain backwards compatibility with Phase 3 tests and avoid unnecessary contract breakage.
Alternatives considered: Re-deriving lints client-side and omitting brief on refresh. Rejected because the database already stores `brief_json` and `warnings_json`, and line 410 explicitly requires them in the response.
If we removed it: The Phase 4 frontend results page would lack the brief and lint warnings on initial load or browser refresh.
Decided by: user approved
Status: written, not yet verified by a test run

### D-099 — Phase 4 — step
What: Increase Next.js proxy timeout to `600000` ms (10 minutes) in `apps/web/next.config.ts`, superseding `D-073`.
Why: Architecture synthesis with up to 3 LLM calls, exponential retry backoffs, and network latency can take up to several minutes in worst-case repair scenarios. Raising `proxyTimeout` from `120000` (2 minutes) to `600000` ensures Next.js API route rewrites do not terminate long-running design generation with a 504 Gateway Timeout while FastAPI is still completing.
Alternatives considered: Keeping 120s timeout. Rejected because complex design repairs would trigger false 504 errors in the browser.
If we removed it: Lengthy multi-attempt generation runs would be prematurely severed at the Next.js rewrite proxy.
Decided by: user approved
Status: active

### D-100 — Phase 4 — deviation
What: Adopt obsidian (#0a0a0a) background and neon lime (#ccff00) accent for page chrome as a design deviation from BUILD_PLAN.md:454.
Why: The SuperDesign system introduces obsidian (#0a0a0a) and neon lime (#ccff00) for high-contrast tech minimalism in page chrome (header, hero, and interactive accents). BUILD_PLAN.md line 454 states "Do not: add ... other colours". The user explicitly approved neon lime and obsidian for page chrome only, while strictly maintaining the four plan colors (emerald for entry, violet for exit, amber for needs_model, and slate for plain) for node borders and structural badges.
Alternatives considered: Adhering strictly to shadcn neutral base tokens for all page elements. Rejected per user approval of obsidian and neon lime chrome styling.
If we removed it: The user interface would lack the obsidian tech-minimalist aesthetic established in the approved design system.
Decided by: user approved
Status: active

### D-101 — Phase 4 — deviation
What: Replace third-party npm package "cn" with the standard shadcn helper using `clsx` and `tailwind-merge` in `src/lib/utils.ts`.
Why: Initial project scaffolding imported an external third-party package `"cn"` (`^0.5.0`) in `button.tsx:3`, `card.tsx:2`, and `utils.ts:1`. Standard shadcn component design implements `cn` locally by combining `clsx` and `tailwind-merge` (both already installed in `apps/web/package.json`), avoiding an unnecessary, unvetted external dependency for simple class concatenation.
Alternatives considered: Keeping `"cn": "^0.5.0"`. Rejected because externalizing trivial utility functions creates unnecessary supply-chain risk and diverges from standard shadcn conventions.
If we removed it: The project would retain an extraneous external dependency that duplicates functionality already provided by `clsx` and `tailwind-merge`.
Decided by: user approved
Status: active

### D-102 — Phase 4 — dependency
What: Install `@dagrejs/dagre` for client-side directed acyclic graph layout computation.
Why: Directed graph visualization requires calculating exact 2D coordinates (x, y) for nodes and routing points for edges so that data flows cleanly left-to-right without node overlapping. `@dagrejs/dagre` is a modern, TypeScript-native fork of Dagre that runs purely in memory and computes deterministic positions based on configured node separations (`nodesep: 40`, `ranksep: 80`).
Alternatives considered: Legacy `dagre` package (v0.8.5). Rejected because legacy dagre lacks bundled TypeScript definitions and is unmaintained, whereas `@dagrejs/dagre` provides native typing.
If we removed it: Graph nodes would have to be positioned manually or stacked haphazardly, causing visual collisions and overlapping edges.
Decided by: plan
Status: active

### D-103 — Phase 4 — dependency
What: Install `zod` for strict runtime validation of backend API response payloads.
Why: TypeScript types exist only at compile time and disappear in the browser. When the frontend receives data over the network from `/api/intake/turn`, `/api/designs`, or `/api/health`, `zod` parses and validates the JSON structure against expected schemas before rendering. If the backend returns malformed data or unexpected errors, Zod catches the mismatch immediately and surfaces a clean, typed `ApiError` rather than crashing the React render loop with undefined property errors.
Alternatives considered: Manual type assertions (`as DesignResponse`) or Yup. Rejected because type assertions provide zero runtime safety and Yup is less seamlessly integrated with TypeScript type inference than Zod.
If we removed it: Unexpected API response shapes or null fields would cause uncaught client-side JavaScript crashes during component rendering.
Decided by: plan
Status: active

### D-104 — Phase 4 — design
What: Derive node card border colors and status badges strictly from graph structure and topological roles.
Why: Node functional types are free-text strings invented per use case (e.g. "api_gateway", "queue_worker", "vector_store") and must never be constrained to a hardcoded enum or dictate visual styles. Instead, visual styling derives purely from structural properties: Entry nodes (emerald), Exit nodes (violet), AI model nodes (amber), and internal nodes (slate), with lock icons marking constraint participants (`node_id`, `a`, `b`).
Alternatives considered: Keyword matching on node type strings (e.g., turning "database" blue). Rejected because rule 3 strictly mandates that node types are free text and never drive styling.
If we removed it: The UI would couple visual styling to arbitrary English words, breaking when novel component types are invented by the LLM.
Decided by: plan
Status: active

### D-105 — Phase 4 — design
What: Enforce fixed node card dimensions of 220 by 72 pixels for all diagram components.
Why: Dagre requires predefined node bounding boxes to calculate collision-free graph coordinates and edge routing. Standardizing all node cards to 220x72 pixels ensures predictable, deterministic layouts across varying screen sizes and zoom levels, truncating lengthy labels on the card while revealing full details in the detail panel.
Alternatives considered: Dynamic auto-sizing node cards based on text length. Rejected because dynamic dimensions introduce layout jitter, node overlap, and nondeterministic edge route crossings.
If we removed it: Variable text lengths would cause Dagre to compute inconsistent layouts, and node cards could overlap or produce jagged diagram rows.
Decided by: plan
Status: active

### D-106 — Phase 4 — dependency
What: Install `@xyflow/react` for the interactive architecture diagram canvas.
Why: The core feature of Phase 4 is rendering an interactive, read-only DAG canvas with pan, zoom, fitView padding, accessible keyboard focus, and custom node cards. `@xyflow/react` (v12) is the modern React Flow library supporting React 19, providing declarative node/edge rendering, built-in viewport controls, and native SVG edge path generation.
Alternatives considered: Writing a bespoke SVG/HTML canvas renderer from scratch. Rejected because custom canvas implementations lack robust pan/zoom handling, coordinate transformations, and accessibility primitives.
If we removed it: The application would lack an interactive diagram canvas to visualize generated system architectures.
Decided by: plan
Status: active

### D-107 — Phase 4 — dependency
What: Install `@testing-library/user-event` as a dev dependency for keyboard interaction testing.
Why: Testing keyboard accessibility on diagram nodes (Tab navigation, Enter/Space selection, Escape deselection) requires simulating realistic browser user events including focus management, keydown, and keyup event dispatching. `@testing-library/user-event` provides higher-level dispatch simulation than raw `fireEvent`.
Alternatives considered: Using `fireEvent.keyDown` only. Rejected because `fireEvent` does not simulate browser focus switches or full keyboard event sequences.
If we removed it: Keyboard selection and tab navigation tests would lack realistic browser interaction simulation.
Decided by: plan
Status: active

### D-108 — Phase 4 — dependency
What: Add shadcn UI `badge` and `separator` components to `apps/web/src/components/ui/`.
Why: `badge` provides styled, accessible pill indicators for node structural classifications (`Entry`, `Exit`, `AI model`) in diagram node cards and detail panels. `separator` provides accessible horizontal dividing rules between detail panel sections (`Role`, `Connected from / Sends to`, `Inputs/Outputs`, `Rules`).
Alternatives considered: Ad-hoc custom inline Tailwind divs for badges and rules. Rejected because shadcn primitives guarantee consistent design token usage and semantic HTML attributes (`role="separator"`).
If we removed it: Section dividers and status indicators would require bespoke styling, increasing CSS duplication.
Decided by: plan
Status: active

### D-109 — Phase 4 — file
What: Create Vitest JSDOM environment setup file `apps/web/src/test/setup.ts` with mocks for `ResizeObserver` and `DOMRect`.
Why: React Flow (`@xyflow/react`) relies on browser layout APIs (`ResizeObserver` and `getBoundingClientRect`) to measure container dimensions and position nodes. JSDOM does not implement `ResizeObserver` or full SVG bounding box calculations, causing component tests to crash unless mock stubs are provided in the test environment setup.
Alternatives considered: Inlining mocks in every individual test file. Rejected because DRY global setup in `src/test/setup.ts` ensures consistent test environment behavior across all component test suites.
If we removed it: Any Vitest unit test mounting `@xyflow/react` or `DiagramView` would throw `ReferenceError: ResizeObserver is not defined`.
Decided by: agent proposed, user approved
Status: active

### D-200 — Stage E1 — deviation
What: Introduce evaluation suite cases, pure metrics aggregation in evals/metrics.py, side-by-side comparison in evals/compare.py, and dedicated test runner in evals/tests.
Why: To systematically measure LLM prompt performance across multiple repeated runs rather than relying on single manual invocations, Stage E1 introduces the evaluation dataset in evals/cases/ and evaluation tools. evals/metrics.py is introduced as a pure calculation module containing run dataclasses and aggregation statistics (attempt-1 pass rate, final pass rate, fallback rate, code repair rate, average node counts, lint and error counts) with zero database, LLM, or app-layer imports. As a deviation approved by the user, tests live in evals/tests/test_evals.py rather than apps/api/tests/, preserving apps/api/pyproject.toml and its type-checker scope unchanged. scripts/check.ps1 receives one added step to run pytest on evals/tests from the apps/api virtual environment.
Alternatives considered:
1. Placing test_evals.py in apps/api/tests/: Rejected because it would require altering apps/api/pyproject.toml (adding repo-root to pythonpath and mypy_path), coupling the core API type-check scope to root developer tooling.
2. Inlining metric calculations into evals/compare.py: Rejected because separating pure aggregation into evals/metrics.py allows clean unit testing without CLI argument parsing or presentation overhead.
If we removed it: Prompt performance changes would remain anecdotal and could not be regression-tested deterministically across runs.
Decided by: agent proposed, user approved
Status: active

### D-110 — Phase 4 — step
What: Configure ESLint rule `react/no-danger: "error"` in `apps/web/eslint.config.mjs`.
Why: Project Rule 5 strictly dictates that user text and LLM text are untrusted, must be rendered as plain text, and must never use `dangerouslySetInnerHTML`. Setting `react/no-danger: "error"` automates lint enforcement, causing static analysis and CI checks to fail immediately if unsafe HTML injection is introduced.
Alternatives considered: Manual code review without an automated linter rule. Rejected because architectural security invariants require automated CI gatekeeping.
If we removed it: Developers could inadvertently introduce `dangerouslySetInnerHTML`, opening XSS vulnerabilities.
Decided by: plan
Status: active

### D-111 — Phase 4 — deviation
What: Create custom edge component `apps/web/src/components/diagram/DiagramEdge.tsx` with keyboard-focusable label disclosure.
Why: `BUILD_PLAN.md:434` listed diagram components (`Banner`, `DiagramNode`, `DetailPanel`, `FallbackList`, `NotesPanel`, `ConstraintsPanel`, `DiagramView`) but did not include a separate file for custom edges. However, `BUILD_PLAN.md:436-439` and accessibility requirements mandate that edge flow labels longer than 40 characters must be truncated and disclose full text on both hover and keyboard focus (`tabIndex={0}`). Standard React Flow SVG edges render plain SVG text elements without accessible HTML keyboard focus or disclosure popovers. Extracting `DiagramEdge.tsx` using `EdgeLabelRenderer` provides modular, keyboard-navigable edge labels with accessible tooltip popovers.
Alternatives considered: Inlining the custom edge renderer inside `DiagramView.tsx`. Rejected because modular separation keeps `DiagramView.tsx` concise and allows direct edge unit testing.
If we removed it: Edge labels would either lack keyboard focus/disclosure capabilities (violating accessibility requirements) or clutter `DiagramView.tsx`.
Decided by: agent proposed (pending user approval)
Status: active

### D-112 — Phase 4 — decision
What: User approval of custom `DiagramEdge.tsx` (D-111) and removal of unrequested `hideAttribution` option in `DiagramView.tsx`.
Why: D-111 (custom `DiagramEdge.tsx` for keyboard-focusable edge labels, a deviation from the `BUILD_PLAN.md:434` file list) was approved by user after edge-label truncation, hover, and keyboard-focus accessibility tests passed in the user's `scripts/check.ps1` verification run (54 of 54 vitest tests passed). In addition, the unrequested `proOptions={{ hideAttribution: true }}` setting in `DiagramView.tsx` was removed because React Flow attribution removal terms were not verified.
Alternatives considered: Retaining `hideAttribution: true`. Rejected because removing vendor attribution without verifying license terms violates compliance principles.
If we removed it: D-111 would remain unapproved and unrequested license-sensitive configuration would persist in diagram canvas code.
Decided by: user approved
Status: active

### D-113 — Phase 4 — dependency
What: Add shadcn UI components `textarea`, `alert`, and `skeleton` to `apps/web/src/components/ui/` for Stage 4C1.
Why: The intake chat interface and home page require multi-line user input (`textarea`), accessible alert banners for validation and API error notifications (`alert`), and accessible placeholder loading states (`skeleton`). Adding only these three components keeps the dependency footprint minimal for Stage 4C1 (leaving `tabs` for Stage 4C2).
Alternatives considered: Ad-hoc raw HTML elements with custom utility styling. Rejected because shadcn UI components adhere to shared design tokens and Radix ARIA accessibility primitives.
If we removed it: Input fields and error messages would require custom styling and bespoke ARIA attributes, duplicating component logic.
Decided by: plan
Status: active

### D-114 — Phase 4 — design
What: Configure typography with `next/font/google` using Space Grotesk (headings and display) and JetBrains Mono (technical specifications, code, and badges).
Why: Next.js Google Fonts integration automatically downloads font files at build time and self-hosts them alongside static assets, eliminating external runtime requests to Google servers, preventing privacy/GDPR concerns, and preventing layout shift (CLS) via automatic size-adjust fallbacks.
Alternatives considered: Runtime CDN `@import` or Google Fonts `<link>` tags. Rejected because external runtime font fetches introduce network latency, external third-party tracking, and potential layout shifts.
If we removed it: The application would fall back to generic system fonts, diverging from the approved design system.
Decided by: user approved
Status: active

### D-115 — Phase 4 — design
What: Implement page chrome aesthetic with obsidian dark background and neon lime (`#ccff00`) accents for page chrome only, retaining glass blur, with subtle static grid, no grain, no animated grid, and honoring `prefers-reduced-motion` (referring to D-100).
Why: User approved the obsidian tech-minimalist aesthetic for outer page chrome, headers, and primary action buttons in Phase 4 decisions (D-100). Graph node border colors remain strictly tied to the four structural plan colors (`emerald`, `violet`, `amber`, `slate`). Disabling grain and animated canvas grids preserves rendering performance and respects user motion preferences (`motion-reduce`).
Alternatives considered: Full animated canvas grid and heavy noise textures. Rejected per user instructions to avoid visual distraction and excess GPU utilization.
If we removed it: The home page would lack the visual cohesion of the approved dark tech theme.
Decided by: user approved
Status: active

### D-116 — Phase 4 — design
What: Enforce loading overlay copy "Designing your system. This can take up to a minute, sometimes longer." with an active elapsed-seconds counter and motion-safe spinner.
Why: Multi-step LLM architecture synthesis and repair loops can take between 15 and 60 seconds depending on model response latency. Setting clear, truthful expectations with an active elapsed timer reassures the user that generation is in progress without hardcoding arbitrary timeout estimates.
Alternatives considered: Indeterminate spinner without elapsed timer or with fake progress percentage. Rejected because fake percentages violate Rule 1 (code validates and produces numbers, no invented figures).
If we removed it: Users might perceive slow LLM responses as application freezes and abandon generation prematurely.
Decided by: user approved
Status: active

### D-117 — Phase 4 — deviation
What: Extract `BriefCard` component (`apps/web/src/components/BriefCard.tsx`) to display the synthesized requirement brief and "Generate design" action, as a structural deviation from the BUILD_PLAN.md:434 file list.
Why: BUILD_PLAN.md:434 lists `apps/web/src/components/chat/IntakeChat.tsx` and `LoadingOverlay.tsx` but does not explicitly name `BriefCard.tsx`. Extracting the brief presentation, constraint list, unverifiable requirement callouts, and "Generate design" action into a dedicated subcomponent keeps `page.tsx` and chat state modular, readable, and cleanly unit-testable.
Alternatives considered: Inlining all brief presentation markup directly inside `page.tsx`. Rejected because embedding 150+ lines of card formatting, list mapping, and conditional dividers within `page.tsx` obscures top-level chat orchestrator logic.
If we removed it: Brief display markup would have to be inlined directly inside `page.tsx`.
Decided by: deviation
Status: active

### D-118 — Phase 3 — bugfix
What: Register `LLMError` exception handler in `apps/api/src/archnemesis/main.py` mapping low-level LLM client exceptions (`LLMUnavailable`, `LLMRateLimited`, `LLMTimeout`, `LLMBadOutput`, `LLMNotConfigured`) to canonical `AppError` HTTP envelopes, and prevent transient LLM error swallowing in `apps/api/src/archnemesis/modules/intake/service.py`.
Why: When Gemini API raises 503 (high demand spike / unavailable), 429 (rate limit), or 504 (timeout), the LLM client layer raises `archnemesis.llm.base.LLMError` subclasses (`LLMUnavailable`, `LLMRateLimited`, `LLMTimeout`). Because these inherit from Python's base `Exception` rather than `AppError` (enforced by import-linter rules forbidding `llm` from importing `errors`), unhandled exceptions bubbled past `app.add_exception_handler(AppError, ...)` to the generic `unhandled_exception_handler` and returned HTTP 500 `INTERNAL_ERROR`. Furthermore, in `intake/service.py`, `_invoke_intake_llm` caught generic `Exception`, incorrectly triggering a prompt repair loop and transforming 503/429/504 errors into 502 `LLMBadOutputError`. Adding the centralized `LLMError` handler in `main.py` and bypassing transient LLM errors in `intake/service.py` ensures both `/api/designs` and `/api/intake/turn` consistently return friendly, contract-compliant responses (503 `LLM_UNAVAILABLE`, 429 `LLM_RATE_LIMITED`, 504 `LLM_TIMEOUT`) without saving corrupted or partial state.
Alternatives considered: Having `archnemesis.llm.base.LLMError` inherit directly from `AppError`. Rejected because `pyproject.toml` and `GEMINI.md` architectural layer rules strictly forbid `archnemesis.llm` from importing `archnemesis.errors` or other application modules.
If we removed it: Live LLM spikes (503) or rate limits (429) would surface as unhandled 500 Internal Server Errors on `/api/designs` and misleading 502 Bad Output errors on `/api/intake/turn`.
Decided by: user approved (Phase 3 bugfix)
Status: active

### D-119 — Phase 4 — dependency
What: Add shadcn UI `tabs` component to `apps/web/src/components/ui/tabs.tsx` for Stage 4C2 using installed Radix UI primitives.
Why: BUILD_PLAN.md:435 explicitly lists `tabs` as one of the required shadcn components, and BUILD_PLAN.md:445 mandates the two primary views on the results page: "Diagram" and "Explanation". Implementing the component using the existing `@/lib/utils` `cn` helper and `radix-ui` primitives avoids adding extraneous third-party packages or triggering supply-chain risks.
Alternatives considered: Ad-hoc custom tab buttons with local active-tab React state. Rejected because shadcn `tabs` provides accessible ARIA tablist/tab/tabpanel roles and keyboard arrow navigation out-of-the-box.
If we removed it: The results page would require custom accessible tab primitives and keyboard focus navigation management.
Decided by: plan
Status: active

### D-120 — Phase 4 — fix
What: Establish single source of truth for obsidian background colour (`#0a0a0a`) via CSS variable `--page-bg: #0a0a0a;` in `apps/web/src/app/globals.css`, updating `layout.tsx:28` and `page.tsx:127` to match D-100.
Why: D-100 defined obsidian (`#0a0a0a`) for page chrome. The initial scaffolding had used Tailwind's zinc-950 (`#09090b`) in `layout.tsx` and `page.tsx`. Defining `--page-bg: #0a0a0a` in `globals.css` centralizes the color token in one place and ensures exact visual consistency across the root layout, home page, and results page without duplicating raw hex strings.
Alternatives considered: Leaving hardcoded hex `#09090b` or scattering `#0a0a0a` across individual JSX style tags. Rejected to maintain a single authoritative design token.
If we removed it: Color divergence between `#0a0a0a` and `#09090b` would persist across different route views.
Decided by: user approved
Status: active

### D-121 — Phase 4 — design
What: Implement results page architecture for `/design/[id]` using Next.js App Router client component, TanStack Query `getDesign`, responsive canvas/fallback-list switching, and accessible interactive detail and notes panels.
Why: BUILD_PLAN.md:433-447 specifies that `/design/[id]` loads the validated architecture specification and requirement brief. Using TanStack Query with `getDesign` guarantees Zod runtime validation of the backend payload before rendering. Below 768px, a non-crashing SSR-safe matchMedia hook switches from the React Flow canvas to the linear `FallbackList` in `flow_order`. Selected nodes reveal the full `DetailPanel` (right column at >=1024px, stacked below otherwise), and `NotesPanel` surfaces lint notes and unverifiable requirements.
Alternatives considered: Server component rendering with inline fetch. Rejected because interactive graph selection, canvas pan/zoom, responsive list switching, and Escape-key dismissals require rich client-side interactivity and shared TanStack Query caching.
If we removed it: The application would lack the primary user-facing output deliverable of the product.
Decided by: plan
Status: active

### D-122 — Phase 4 — fix
What: Wrap dynamic `useParams()` consumer in `apps/web/src/app/design/[id]/page.tsx` within a React `Suspense` boundary providing `DesignPageLoading` skeleton fallback.
Why: Next.js App Router (especially with Cache Components / dynamic prerendering) detects client hooks that read route parameters (`useParams()`, `useSearchParams()`) outside of a `<Suspense>` boundary and reports a blocking-prerender error (`blocking-prerender-client-hook`). Moving `useParams()` into an inner component (`DesignContent`) and wrapping it in `<Suspense fallback={<DesignPageLoading />}>` allows Next.js to prerender the surrounding static shell while dynamically resolving the route parameters and design data at runtime.
Alternatives considered: Setting `export const dynamic = 'force-dynamic'` or `export const instant = false`. Rejected because wrapping the dynamic leaf in Suspense is the standard Next.js architecture that preserves static shell prerendering and skeleton streaming.
If we removed it: Next.js prerendering during build or runtime would log "blocking-prerender-client-hook" warnings or fail production route builds.
Decided by: user approved (Stage 4C2 fix 4)
Status: active

### D-123 — Phase 4 — fix
What: Assign `zIndex: 1001` and opaque background `bg-background` to custom edge labels in `apps/web/src/components/diagram/DiagramEdge.tsx`.
Why: React Flow renders `<div className="react-flow__edgelabel-renderer">` before `<NodeRenderer>` in the Viewport DOM hierarchy. Because Dagre rank separation (`RANKSEP = 80px`) is narrower than a 40-character or clamped (150px-168px) edge label pill, the label pill overlaps adjacent node boxes by ~44px. Without an explicit positive z-index, CSS stacking rules paint node cards on top of edge labels, partially hiding flow text ("Article Snippets", "JSON Payload"). Setting `zIndex: 1001` on the label wrapper positions edge labels in front of all node cards (unselected nodes have z-index 0, selected nodes have 1000), while the opaque background prevents underlying node borders and text from bleeding through.
Alternatives considered: Option 2: increasing `RANKSEP` beyond 80 in `layout.ts`. Rejected because `BUILD_PLAN.md:436` specifies `nodesep: 40` and `ranksep: 80`, and Option 1 resolves the legibility defect cleanly without altering DAG geometry or violating project contracts.
If we removed it: Edge label flow descriptions would be painted behind node boxes in multi-rank topologies and partially obscured.
Decided by: user approved (Stage 4 Fix 5)
Status: active

### D-124 — Phase 4 — deviation
What: Treat Dagre rank separation (`ranksep: 80`) as a dynamic minimum that automatically expands when edge flow labels require more horizontal space, approved by user (superseding fixed rank separation in `BUILD_PLAN.md:436`).
Why: `BUILD_PLAN.md:436` specified a static `ranksep: 80`. However, real business flow descriptions (such as "Article Snippets" at 130px or "HTTPS / WebSocket" at 144px) exceed 80px. Because edge label pills are centered on edge midpoints, any label wider than 80px extends into adjacent node rectangles by $(W - 80)/2$ pixels, cutting off node type labels and badges. Passing `{ width: labelWidth, height: 26, labelpos: 'c' }` to Dagre per edge when `labelWidth > 80` leverages Dagre's native edge dummy-node rank spacing to expand that rank gap to `80 + labelWidth`, maintaining a strict 40px margin on both sides of the label while keeping the minimum gap at 80px for short or empty labels.
Alternatives considered: Global uniform `ranksep: 250`. Rejected because compact DAGs with short labels ("auth", "raw data") would become needlessly sparse and horizontally stretched.
If we removed it: Multi-word edge labels would physically cover node cards, badges, and type headers in multi-rank diagrams.
Decided by: user approved (Stage 4 Fix 6)
Status: active

### D-125 — Phase 4 — design
What: Implement pure, deterministic label width estimation helper (`estimateLabelWidth`) sharing unified styling constants between `layout.ts` and `DiagramEdge.tsx`.
Why: Dagre graph layout runs headlessly during React render passes and unit tests without DOM access (`document.createElement` or `canvas.measureText`). Estimating pixel widths purely from monospace character advances (~7px per ASCII char, ~14px per CJK wide char), horizontal padding (16px), borders (2px), and a hard ceiling (`MAX_LABEL_TEXT_WIDTH = 150px`) guarantees deterministic graph coordinates across all environments while preventing layout and rendering geometry from drifting apart.
Alternatives considered: Using headless canvas `measureText` via Node.js or jsdom. Rejected to keep `layout.ts` pure, zero-dependency, and isomorphic between client and server environments.
If we removed it: The diagram layout engine would be unable to calculate accurate rank clearances prior to DOM mounting.
Decided by: user approved (Stage 4 Fix 6)
Status: active

### D-126 — Phase 5 — design
What: Explanation draft validation and verification engine (`verify.py`) with deterministic error codes and strict number and forbidden-word checking.
Why: Enforces Rule 1 ("The LLM designs structure and writes prose. Code validates and produces every number.") and Rule 8 ("Never claim legal or regulatory compliance in any output."). Code verifies that every node and constraint referenced exists in the spec, flow order matches topological sort, sections stay under character limits, no unapproved numbers appear (only brief numbers, node count, and integers 1..N), no forbidden pricing/budget/timeline terms are used, and no compliance or security guarantees are made.
Alternatives considered: Checking numbers with flexible NLP or boundary heuristics. Rejected because strict deterministic parsing aligns with `BUILD_PLAN.md:474` and prevents hallucinated statistics from reaching users.
If we removed it: Hallucinated metrics, incorrect topological flows, or forbidden marketing/cost claims from the LLM would be presented to users as authoritative technical designs.
Decided by: user approved (BUILD_PLAN.md:473-475, Phase 5 Plan)
Status: active

### D-127 — Phase 5 — design
What: Code-only fallback explanation generator (`fallback.py`) for guaranteed zero-LLM failure recovery.
Why: Per `BUILD_PLAN.md:476-477`, if an LLM explanation fails verification after 1 retry (total 2 LLM calls), the system falls back to a deterministic, template-based explanation constructed solely from validated `ArchitectureSpec` data. This guarantees that every valid design always has a readable explanation without ever exposing an invalid LLM output or failing the request.
Alternatives considered: Throwing a 422 error or returning an empty explanation. Rejected because users must always receive an explanation when viewing a valid design.
If we removed it: A malfunctioning or non-compliant LLM draft would result in a broken UI tab or an unhandled failure state for the end user.
Decided by: user approved (BUILD_PLAN.md:476-477, Phase 5 Plan)
Status: active

### D-128 — Phase 5 — architecture
What: Add `archnemesis.modules.explainer` to import-linter sibling independence contract in `apps/api/pyproject.toml`.
Why: Maintains architectural boundary that sibling feature modules (`intake`, `architect`, `explainer`) cannot import each other, keeping each module decoupled and isolated.
Alternatives considered: Allowing direct sibling imports. Rejected to preserve modular integrity and testability.
If we removed it: Explainer could inadvertently couple to intake or architect internal logic, violating clean architecture rules.
Decided by: user approved (GEMINI.md layout rules)
Status: active

### D-129 — Phase 5 — architecture
What: Explainer service with lazy evaluation, 2-call retry loop with verification feedback, and deterministic fallback.
Why: Per `BUILD_PLAN.md:469`, explanations are generated lazily on first access and cached in `design_versions.explanation_json`. If the first LLM attempt produces verification errors, a second attempt provides structured diagnostic feedback. If that also fails, the pure fallback explanation is applied so valid designs are never broken.
Alternatives considered: Eager generation during design creation. Rejected because pre-sales users may only view the diagram; lazy generation saves tokens and keeps design creation fast.
If we removed it: Explanation generation would either slow down initial design creation or fail completely on imperfect LLM outputs.
Decided by: user approved (BUILD_PLAN.md:469, 476)
Status: active

### D-130 — Phase 5 — architecture
What: Explainer repository (`modules/explainer/repo.py`) with conditional update concurrency protection and no transaction across LLM calls.
Why: To prevent race conditions during concurrent requests for the same design explanation, the repo performs `UPDATE design_versions SET explanation_json = :json WHERE id = :id AND explanation_json IS NULL`. If rowcount is 0, it re-reads and returns the existing stored explanation. Transactions are never held open across external LLM network calls.
Alternatives considered: Holding a database row lock across the LLM call. Rejected to prevent connection pool exhaustion and database lock contention during multi-second LLM responses.
If we removed it: Concurrent requests for the same design could cause duplicate writes, race conditions, or long-lived database transactions during LLM latency spikes.
Decided by: user approved (Phase 5 Plan)
Status: active

### D-131 — Phase 5 — prompt
What: Single prompt template `prompts/writer_v1.md` with untrusted user text encapsulation and structured JSON output.
Why: The prompt uses `<untrusted_user_text>` tags to encapsulate spec and brief data, protecting against prompt injection. Per `BUILD_PLAN.md:483`, no forbidden words, effort/cost references, or hardcoded numbers appear in the prompt itself.
Alternatives considered: Creating a separate repair prompt (`writer_repair_v1.md`). Rejected per user instruction to use a single prompt file for initial and repair attempts.
If we removed it: Prompt injection could hijack the explanation prose, or negative constraint keywords in system instructions could unintentionally trigger hallucinations.
Decided by: user approved (BUILD_PLAN.md:468, 483)
Status: active

### D-132 — Phase 5 — design
What: Exposing optional `explanation` in `DesignResponse` (Option A) and mounting `POST /api/designs/{id}/versions/{n}/explanation`.
Why: Option A adds `explanation: Explanation | None = None` to `DesignResponse`, populated in `GET /api/designs/{id}` when present, while the dedicated POST endpoint allows client-triggered lazy generation and retry on the Explanation tab.
Alternatives considered: Nested separate endpoints without explanation in `DesignResponse`. Rejected because returning explanation in `GET /api/designs/{id}` when cached reduces frontend round-trips upon page reload.
If we removed it: Frontend would have to issue two separate requests every time a user loads an existing design.
Decided by: user approved (Phase 5 Plan, Option A)
Status: active

### D-133 — Phase 5 — frontend
What: Explanation tab UI component (`ExplanationView.tsx`) with plain text rendering, fixed section hierarchy, and fallback indicators.
Why: Per `BUILD_PLAN.md:478` and `483`, all explanations must be displayed with exact headings in order (`Overview`, `How a request flows`, `Each part`, `Why the checks exist`, `Where AI models are used`). Markdown rendering and `dangerouslySetInnerHTML` are strictly forbidden to ensure LLM prose is displayed as safe, untrusted plain text without third-party HTML/markdown parsing vulnerabilities.
Alternatives considered: Installing `react-markdown`. Rejected because plain text eliminates XSS risks and avoids adding new external dependencies.
If we removed it: Unvalidated LLM output could introduce rendering bugs or security issues if treated as markdown or HTML.
Decided by: user approved (BUILD_PLAN.md:478, 483)
Status: active

### D-134 — Phase 5 — frontend
What: Lazy fetching of explanation in `apps/web/src/app/design/[id]/page.tsx` via TanStack Query triggered only when the Explanation tab is selected.
Why: Per `BUILD_PLAN.md:469`, generation and fetching of the written explanation is lazy. If `DesignResponse` already contains an explanation, it is rendered immediately without network calls. Otherwise, `useQuery` with `enabled: activeTab === "explanation"` and `staleTime: Infinity` fires a single request to `POST /api/designs/{id}/versions/{n}/explanation` when the user opens the tab, preventing unwanted generation on initial page load.
Alternatives considered: Eagerly fetching on page mount. Rejected because users viewing only the diagram should not trigger explanation generation or token usage.
If we removed it: Every design page view would fire explanation generation requests even if the user never viewed the Explanation tab.
Decided by: user approved (BUILD_PLAN.md:469, 478)
Status: active

### D-135 — Phase 6 — dependency
What: Adding `email-validator` to backend dependencies for RFC-compliant email address format verification.
Why: Per `BUILD_PLAN.md:499`, `email-validator` validates email syntax (including deliverability syntax checks) for lead submission payloads without writing custom or fragile regexes.
Alternatives considered: Writing a custom regex or basic string check. Rejected because RFC email validation has numerous edge cases, and the Build Plan explicitly specifies `email-validator`.
If we removed it: Invalid or malformed email strings could be saved as qualified leads.
Decided by: user approved (BUILD_PLAN.md:499)
Status: active

### D-136 — Phase 6 — architecture
What: `LeadTable` persistence pointing to exact design version via foreign key on `(design_id, version_no)` referencing `design_versions(design_id, version_no)`.
Why: Per `BUILD_PLAN.md:500`, every lead must point to an exact design version so the pre-sales team can inspect the identical architecture spec, brief, and walkthrough the lead viewed at submission time.
Alternatives considered: Referencing only `design_id`. Rejected because designs can evolve across versions, and associating a lead with a mutable current version loses fidelity.
If we removed it: Leads could not be audited against the specific architecture state shown to the user.
Decided by: user approved (BUILD_PLAN.md:500)
Status: active

### D-137 — Phase 6 — security
What: Honeypot field `website` silently returning HTTP 201 `{status: "received"}` without database persistence.
Why: Per `BUILD_PLAN.md:501`, automated spam bots filling the hidden honeypot field must receive the standard 201 success response so they do not detect the trap or retry with alternate forms, while keeping spam entirely out of the database and logs.
Alternatives considered: Returning 400/422 on honeypot submission. Rejected because bots would adapt their payloads upon receiving error codes.
If we removed it: Lead storage would be vulnerable to bot spam and contaminated leads.
Decided by: user approved (BUILD_PLAN.md:501)
Status: active

### D-138 — Phase 6 — security
What: Admin token authentication using constant-time comparison via `hmac.compare_digest`, returning HTTP 404 when `ADMIN_TOKEN` is unset/empty and HTTP 401 `UNAUTHORIZED` when missing or invalid.
Why: Per `BUILD_PLAN.md:503`, timing attacks against admin authentication are prevented via `hmac.compare_digest`. Returning 404 when unconfigured hides the presence of admin endpoints in environments where admin functionality is disabled.
Alternatives considered: Standard string equality (`==`) and 401 when unset. Rejected because string equality is susceptible to timing side-channels and 401 confirms endpoint existence when unconfigured.
If we removed it: Admin endpoints would be subject to timing attacks and port scanning leaks.
Decided by: user approved (BUILD_PLAN.md:503)
Status: active

### D-139 — Phase 6 — design
What: Supersedes D-136. `LeadTable` persistence pointing to exact design version via foreign key on `(design_id, version_no)` referencing `design_versions(design_id, version_no)`. Reclassified under valid label `design`.
Why: Per `BUILD_PLAN.md:500`, every lead must point to an exact design version so the pre-sales team can inspect the identical architecture spec, brief, and walkthrough the lead viewed at submission time.
Alternatives considered: Referencing only `design_id`. Rejected because designs can evolve across versions, and associating a lead with a mutable current version loses fidelity.
If we removed it: Leads could not be audited against the specific architecture state shown to the user.
Decided by: user approved (BUILD_PLAN.md:500)
Status: active

### D-140 — Phase 6 — design
What: Supersedes D-137. Honeypot field `website` silently returning HTTP 201 `{status: "received"}` without database persistence. Reclassified under valid label `design`.
Why: Per `BUILD_PLAN.md:501`, automated spam bots filling the hidden honeypot field must receive the standard 201 success response so they do not detect the trap or retry with alternate forms, while keeping spam entirely out of the database and logs.
Alternatives considered: Returning 400/422 on honeypot submission. Rejected because bots would adapt their payloads upon receiving error codes.
If we removed it: Lead storage would be vulnerable to bot spam and contaminated leads.
Decided by: user approved (BUILD_PLAN.md:501)
Status: active

### D-141 — Phase 6 — design
What: Supersedes D-138. Admin token authentication using constant-time comparison via `hmac.compare_digest`, returning HTTP 404 when `ADMIN_TOKEN` is unset/empty and HTTP 401 `UNAUTHORIZED` when missing or invalid. Reclassified under valid label `design`.
Why: Per `BUILD_PLAN.md:503`, timing attacks against admin authentication are prevented via `hmac.compare_digest`. Returning 404 when unconfigured hides the presence of admin endpoints in environments where admin functionality is disabled.
Alternatives considered: Standard string equality (`==`) and 401 when unset. Rejected because string equality is susceptible to timing side-channels and 401 confirms endpoint existence when unconfigured.
If we removed it: Admin endpoints would be subject to timing attacks and port scanning leaks.
Decided by: user approved (BUILD_PLAN.md:503)
Status: active

### D-142 — Phase 6 — deviation
What: Custom FastAPI `RequestValidationError` exception handler in `main.py` formatting 422 errors into the unified error envelope while strictly omitting raw user `input` from error payloads and logs.
Why: Per `BUILD_PLAN.md:502`, personal lead data (name, email, note) must never be logged or reflected. FastAPI's default 422 handler returns the raw `input` string, which leaks sensitive lead values in API responses and logs when validation fails.
Alternatives considered: Leaving default FastAPI validation handler. Rejected because it directly violates personal data privacy and log leakage constraints.
If we removed it: Invalid name, email, or note contents would be reflected in 422 response bodies and potential log outputs.
Decided by: user approved (BUILD_PLAN.md:502, 512)
Status: active

### D-143 — Phase 6 — step
What: Adding `UnauthorizedError` to `archnemesis.errors` with code `UNAUTHORIZED`, HTTP status 401, and message `Not authorised.`.
Why: Per `BUILD_PLAN.md:503`, a wrong or missing admin token must return 401 UNAUTHORIZED with the message "Not authorised." and the code must be added to the unified error table.
Alternatives considered: Generic `AppError` invocation inside router. Rejected because named subclasses in `errors.py` maintain consistency and testability.
If we removed it: Admin endpoints could not return the canonical unified error response required by the specification.
Decided by: user approved (BUILD_PLAN.md:503)
Status: active

### D-144 — Phase 6 — design
What: Updating `import-linter` contract in `pyproject.toml` to enforce sibling module independence for `archnemesis.modules.leads`.
Why: Per GEMINI.md architectural layer boundaries and BUILD_PLAN.md Section 5, sibling modules (`intake`, `architect`, `explainer`, `leads`) must remain completely independent of one another.
Alternatives considered: Omitting `leads` from the independence contract. Rejected because sibling module imports must be structurally prevented by automated linting.
If we removed it: Sibling coupling could inadvertently be introduced into the leads module.
Decided by: user approved (GEMINI.md, BUILD_PLAN.md Section 5)
Status: active

### D-145 — Phase 6 — step
What: Migration `0003_leads.py` creating the `leads` table with schema `(id, design_id, version_no, name, email, note, consent_text_version, created_at)` and foreign key to `design_versions(design_id, version_no)`.
Why: Per `BUILD_PLAN.md:500`, prospective client leads require dedicated persistence pointing to the exact design version reviewed by the lead.
Alternatives considered: Storing leads in an external document store or unmigrated table. Rejected because relational integrity and Alembic versioning are repository standards.
If we removed it: Lead submissions could not be persisted or linked to generated design versions.
Decided by: user approved (BUILD_PLAN.md:500)
Status: active

### D-146 — Phase 6 — fix
What: Correcting `_seed_design_and_version` in `test_leads.py` with complete `RequirementBrief` and `ArchitectureSpec` schemas, and switching log privacy assertions to `caplog` with explicit non-empty text guards.
Why: `structlog.stdlib.LoggerFactory` routes log events to Python's standard `logging` library where `caplog` captures them, avoiding silent empty captures under `capture_logs()`. Supplying required fields (`users`, `numbers_given.unit`) prevents Pydantic validation errors when admin endpoints deserialize `brief_json`.
Alternatives considered: Mocking logger or relaxing validation in `service.py`. Rejected because production deserialization contract must remain strict and test harness must supply schema-compliant seed records.
If we removed it: Admin test retrieval fails with 500 and log privacy verification passes vacuously on empty lists.
Decided by: user approved (Stage 6A test fix)
Status: active

### D-147 — Phase 6 — fix
What: Log privacy verification in `test_leads.py` using `caplog.records` and `record.getMessage()` across valid, honeypot, 404, and 422 lead submission tests.
Why: Pytest formats `caplog.text` by prepending a prefix (`LEVEL logger:file:line `) before the record message, causing line-level `json.loads()` to fail with JSONDecodeError. Accessing `record.getMessage()` retrieves the unadorned JSON payload produced by structlog's `JSONRenderer()`, allowing robust verification of the `lead_created` event schema and confirmation that personal data never appears in any emitted log record.
Alternatives considered: String splitting `caplog.text` by whitespace. Rejected because log formatting prefixes can vary across environments and platforms.
If we removed it: Structured log JSON assertions in tests fail to parse the log payload.
Decided by: user approved (Stage 6A test fix)
Status: active

### D-148 — Phase 6 — dependency
What: Adding `react-hook-form` and `@hookform/resolvers` for type-safe form state and Zod resolver integration.
Why: Per `BUILD_PLAN.md:499`, `react-hook-form` and `@hookform/resolvers` provide client-side form validation and state management without uncontrolled re-renders or custom form boilerplate.
Alternatives considered: Plain React state with manual validation. Rejected because the Build Plan explicitly specifies `react-hook-form` and `@hookform/resolvers`.
If we removed it: Form validation and error states would require complex manual state management.
Decided by: agent proposed, user approved
Status: active

### D-200 — Stage E1 — deviation
What: Introduce evaluation suite cases, pure metrics aggregation in evals/metrics.py, side-by-side comparison in evals/compare.py, and dedicated test runner in evals/tests.
Why: To systematically measure LLM prompt performance across multiple repeated runs rather than relying on single manual invocations, Stage E1 introduces the evaluation dataset in evals/cases/ and evaluation tools. evals/metrics.py is introduced as a pure calculation module containing run dataclasses and aggregation statistics (attempt-1 pass rate, final pass rate, fallback rate, code repair rate, average node counts, lint and error counts) with zero database, LLM, or app-layer imports. As a deviation approved by the user, tests live in evals/tests/test_evals.py rather than apps/api/tests/, preserving apps/api/pyproject.toml and its type-checker scope unchanged. scripts/check.ps1 receives one added step to run pytest on evals/tests from the apps/api virtual environment.
Alternatives considered:
1. Placing test_evals.py in apps/api/tests/: Rejected because it would require altering apps/api/pyproject.toml (adding repo-root to pythonpath and mypy_path), coupling the core API type-check scope to root developer tooling.
2. Inlining metric calculations into evals/compare.py: Rejected because separating pure aggregation into evals/metrics.py allows clean unit testing without CLI argument parsing or presentation overhead.
If we removed it: Prompt performance changes would remain anecdotal and could not be regression-tested deterministically across runs.
Decided by: agent proposed, user approved
Status: active

### D-149 — Phase 6 — design
What: Adding shadcn UI components (`dialog.tsx`, `input.tsx`, `label.tsx`) backed by `radix-ui`.
Why: Per `BUILD_PLAN.md:499`, modal interaction, text input, and accessible labeling require standard styled primitives matching the app's neutral design tokens. `checkbox.tsx` is omitted per user instruction because consent is purely informational text.
Alternatives considered: Native HTML dialog or unstyled inputs. Rejected because accessible keyboard navigation and unified OKLCH styling are app standards.
If we removed it: Dialog accessibility and styling would be inconsistent with the rest of the UI.
Decided by: agent proposed, user approved
Status: active

### D-200 — Stage E1 — deviation
What: Introduce evaluation suite cases, pure metrics aggregation in evals/metrics.py, side-by-side comparison in evals/compare.py, and dedicated test runner in evals/tests.
Why: To systematically measure LLM prompt performance across multiple repeated runs rather than relying on single manual invocations, Stage E1 introduces the evaluation dataset in evals/cases/ and evaluation tools. evals/metrics.py is introduced as a pure calculation module containing run dataclasses and aggregation statistics (attempt-1 pass rate, final pass rate, fallback rate, code repair rate, average node counts, lint and error counts) with zero database, LLM, or app-layer imports. As a deviation approved by the user, tests live in evals/tests/test_evals.py rather than apps/api/tests/, preserving apps/api/pyproject.toml and its type-checker scope unchanged. scripts/check.ps1 receives one added step to run pytest on evals/tests from the apps/api virtual environment.
Alternatives considered:
1. Placing test_evals.py in apps/api/tests/: Rejected because it would require altering apps/api/pyproject.toml (adding repo-root to pythonpath and mypy_path), coupling the core API type-check scope to root developer tooling.
2. Inlining metric calculations into evals/compare.py: Rejected because separating pure aggregation into evals/metrics.py allows clean unit testing without CLI argument parsing or presentation overhead.
If we removed it: Prompt performance changes would remain anecdotal and could not be regression-tested deterministically across runs.
Decided by: agent proposed, user approved
Status: active

### D-150 — Phase 6 — design
What: `ContactDialog` component integrating lead submission, honeypot trapping, input preservation on error, and exact success text.
Why: Per `BUILD_PLAN.md:507` and `501`, visitor contact requests must capture name, email, optional note, and honeypot field, displaying exact consent text and success text while preserving inputs on API errors.
Alternatives considered: Full-page contact form or external widget. Rejected because modal dialog keeps the user on their generated design page.
If we removed it: Prospective leads could not contact the team directly from their architecture diagram.
Decided by: agent proposed, user approved
Status: active

### D-200 — Stage E1 — deviation
What: Introduce evaluation suite cases, pure metrics aggregation in evals/metrics.py, side-by-side comparison in evals/compare.py, and dedicated test runner in evals/tests.
Why: To systematically measure LLM prompt performance across multiple repeated runs rather than relying on single manual invocations, Stage E1 introduces the evaluation dataset in evals/cases/ and evaluation tools. evals/metrics.py is introduced as a pure calculation module containing run dataclasses and aggregation statistics (attempt-1 pass rate, final pass rate, fallback rate, code repair rate, average node counts, lint and error counts) with zero database, LLM, or app-layer imports. As a deviation approved by the user, tests live in evals/tests/test_evals.py rather than apps/api/tests/, preserving apps/api/pyproject.toml and its type-checker scope unchanged. scripts/check.ps1 receives one added step to run pytest on evals/tests from the apps/api virtual environment.
Alternatives considered:
1. Placing test_evals.py in apps/api/tests/: Rejected because it would require altering apps/api/pyproject.toml (adding repo-root to pythonpath and mypy_path), coupling the core API type-check scope to root developer tooling.
2. Inlining metric calculations into evals/compare.py: Rejected because separating pure aggregation into evals/metrics.py allows clean unit testing without CLI argument parsing or presentation overhead.
If we removed it: Prompt performance changes would remain anecdotal and could not be regression-tested deterministically across runs.
Decided by: agent proposed, user approved
Status: active

### D-151 — Phase 6 — design
What: Results page header integration binding "Contact our team" button to the currently viewed design version.
Why: Per `BUILD_PLAN.md:507`, the "Contact our team" button in the results header opens the contact dialog and sends the version currently shown (`design.current_version`).
Alternatives considered: Floating contact button or footer link. Rejected because the header next to the version badge clearly indicates the version context being discussed.
If we removed it: Users would have no clear entrypoint to initiate contact regarding their design.
Decided by: agent proposed, user approved
Status: active

### D-200 — Stage E1 — deviation
What: Introduce evaluation suite cases, pure metrics aggregation in evals/metrics.py, side-by-side comparison in evals/compare.py, and dedicated test runner in evals/tests.
Why: To systematically measure LLM prompt performance across multiple repeated runs rather than relying on single manual invocations, Stage E1 introduces the evaluation dataset in evals/cases/ and evaluation tools. evals/metrics.py is introduced as a pure calculation module containing run dataclasses and aggregation statistics (attempt-1 pass rate, final pass rate, fallback rate, code repair rate, average node counts, lint and error counts) with zero database, LLM, or app-layer imports. As a deviation approved by the user, tests live in evals/tests/test_evals.py rather than apps/api/tests/, preserving apps/api/pyproject.toml and its type-checker scope unchanged. scripts/check.ps1 receives one added step to run pytest on evals/tests from the apps/api virtual environment.
Alternatives considered:
1. Placing test_evals.py in apps/api/tests/: Rejected because it would require altering apps/api/pyproject.toml (adding repo-root to pythonpath and mypy_path), coupling the core API type-check scope to root developer tooling.
2. Inlining metric calculations into evals/compare.py: Rejected because separating pure aggregation into evals/metrics.py allows clean unit testing without CLI argument parsing or presentation overhead.
If we removed it: Prompt performance changes would remain anecdotal and could not be regression-tested deterministically across runs.
Decided by: agent proposed, user approved
Status: active

### D-152 — Phase 6 — design
What: Constant `LEAD_NOTE_MAX_CHARS = 500` in frontend types/constants mirroring backend `lead_note_max_chars` in `settings.py:38`.
Why: Frontend validation must enforce the identical 500-character note limit as backend setting `lead_note_max_chars` so validation errors trigger client-side before network dispatch.
Alternatives considered: Dynamic fetching of limits endpoint. Rejected because Phase 6 does not define a public limits introspection route and limits are static v1 contracts.
If we removed it: An arbitrary hardcoded literal in the form would drift from backend constraints without clear traceability.
Decided by: agent proposed, user approved
Status: active

### D-200 — Stage E1 — deviation
What: Introduce evaluation suite cases, pure metrics aggregation in evals/metrics.py, side-by-side comparison in evals/compare.py, and dedicated test runner in evals/tests.
Why: To systematically measure LLM prompt performance across multiple repeated runs rather than relying on single manual invocations, Stage E1 introduces the evaluation dataset in evals/cases/ and evaluation tools. evals/metrics.py is introduced as a pure calculation module containing run dataclasses and aggregation statistics (attempt-1 pass rate, final pass rate, fallback rate, code repair rate, average node counts, lint and error counts) with zero database, LLM, or app-layer imports. As a deviation approved by the user, tests live in evals/tests/test_evals.py rather than apps/api/tests/, preserving apps/api/pyproject.toml and its type-checker scope unchanged. scripts/check.ps1 receives one added step to run pytest on evals/tests from the apps/api virtual environment.
Alternatives considered:
1. Placing test_evals.py in apps/api/tests/: Rejected because it would require altering apps/api/pyproject.toml (adding repo-root to pythonpath and mypy_path), coupling the core API type-check scope to root developer tooling.
2. Inlining metric calculations into evals/compare.py: Rejected because separating pure aggregation into evals/metrics.py allows clean unit testing without CLI argument parsing or presentation overhead.
If we removed it: Prompt performance changes would remain anecdotal and could not be regression-tested deterministically across runs.
Decided by: agent proposed, user approved
Status: active

### D-153 — Phase 6 — fix
What: Mock reset lifecycle and pending promise resolution in `ContactDialog.test.tsx`.
Why: `vi.clearAllMocks()` does not clear pending `mockResolvedValueOnce` return queues between tests. An unconsumed mock return in a preceding test was leaking into the pending promise test, resolving the promise immediately and causing the dialog to transition to the success screen before the in-flight "Sending..." disabled state could be asserted. Using `vi.resetAllMocks()` in `beforeEach`/`afterEach`, removing the unused mock, and wrapping resolution in `await act()` ensures deterministic test isolation.
Alternatives considered: Using separate mock instances per test. Rejected because centralized module mocking via `vi.mock` is standard in the test suite.
If we removed it: Tests asserting pending asynchronous states fail due to queue pollution from other test cases.
Decided by: user approved (Stage 6B test fix)
Status: active

### D-154 — Phase 6 — dependency
What: Add shadcn `table` UI component primitives in `apps/web/src/components/ui/table.tsx`.
Why: Standardize styling and accessible semantic structure (`table`, `thead`, `tbody`, `tr`, `th`, `td`) for rendering prospective client leads in `/admin`.
Alternatives considered: Raw unstyled HTML `<table>` or external grid library. Rejected to maintain visual consistency with shadcn system without adding heavy runtime dependencies.
If we removed it: Table layout would require ad-hoc inline styles or divergent markup across admin views.
Decided by: agent proposed, user approved
Status: active

### D-200 — Stage E1 — deviation
What: Introduce evaluation suite cases, pure metrics aggregation in evals/metrics.py, side-by-side comparison in evals/compare.py, and dedicated test runner in evals/tests.
Why: To systematically measure LLM prompt performance across multiple repeated runs rather than relying on single manual invocations, Stage E1 introduces the evaluation dataset in evals/cases/ and evaluation tools. evals/metrics.py is introduced as a pure calculation module containing run dataclasses and aggregation statistics (attempt-1 pass rate, final pass rate, fallback rate, code repair rate, average node counts, lint and error counts) with zero database, LLM, or app-layer imports. As a deviation approved by the user, tests live in evals/tests/test_evals.py rather than apps/api/tests/, preserving apps/api/pyproject.toml and its type-checker scope unchanged. scripts/check.ps1 receives one added step to run pytest on evals/tests from the apps/api virtual environment.
Alternatives considered:
1. Placing test_evals.py in apps/api/tests/: Rejected because it would require altering apps/api/pyproject.toml (adding repo-root to pythonpath and mypy_path), coupling the core API type-check scope to root developer tooling.
2. Inlining metric calculations into evals/compare.py: Rejected because separating pure aggregation into evals/metrics.py allows clean unit testing without CLI argument parsing or presentation overhead.
If we removed it: Prompt performance changes would remain anecdotal and could not be regression-tested deterministically across runs.
Decided by: agent proposed, user approved
Status: active

### D-155 — Phase 6 — design
What: In-memory React Context (`AdminTokenContext`) in `apps/web/src/app/admin/context.tsx` for admin authentication state.
Why: BUILD_PLAN.md:505 mandates that `/admin` keeps the admin token in React state only (never in `localStorage`, never in `sessionStorage`, never in URL). Wrapping the admin subtree in an in-memory context provider allows the token to survive client-side SPA navigation from `/admin` to `/admin/designs/[id]/[n]` without persistent storage.
Alternatives considered: URL query parameter or sessionStorage. Rejected because BUILD_PLAN.md strictly forbids token in URL or persistent storage.
If we removed it: Navigating between `/admin` leads list and design inspection would lose token state or violate security rules by persisting credentials.
Decided by: agent proposed, user approved
Status: active

### D-200 — Stage E1 — deviation
What: Introduce evaluation suite cases, pure metrics aggregation in evals/metrics.py, side-by-side comparison in evals/compare.py, and dedicated test runner in evals/tests.
Why: To systematically measure LLM prompt performance across multiple repeated runs rather than relying on single manual invocations, Stage E1 introduces the evaluation dataset in evals/cases/ and evaluation tools. evals/metrics.py is introduced as a pure calculation module containing run dataclasses and aggregation statistics (attempt-1 pass rate, final pass rate, fallback rate, code repair rate, average node counts, lint and error counts) with zero database, LLM, or app-layer imports. As a deviation approved by the user, tests live in evals/tests/test_evals.py rather than apps/api/tests/, preserving apps/api/pyproject.toml and its type-checker scope unchanged. scripts/check.ps1 receives one added step to run pytest on evals/tests from the apps/api virtual environment.
Alternatives considered:
1. Placing test_evals.py in apps/api/tests/: Rejected because it would require altering apps/api/pyproject.toml (adding repo-root to pythonpath and mypy_path), coupling the core API type-check scope to root developer tooling.
2. Inlining metric calculations into evals/compare.py: Rejected because separating pure aggregation into evals/metrics.py allows clean unit testing without CLI argument parsing or presentation overhead.
If we removed it: Prompt performance changes would remain anecdotal and could not be regression-tested deterministically across runs.
Decided by: agent proposed, user approved
Status: active

### D-156 — Phase 6 — design
What: Next.js layout metadata `robots: { index: false, follow: false }` for `/admin` sub-routes in `apps/web/src/app/admin/layout.tsx`.
Why: BUILD_PLAN.md:505 mandates that admin pages are marked `noindex`. Placing standard Next.js App Router robots metadata in the admin layout guarantees that `/admin` and all descendant inspection pages emit `<meta name="robots" content="noindex, nofollow"/>`.
Alternatives considered: Per-page meta tags or robots.txt only. Rejected because Next.js App Router layout metadata automatically cascades to all nested client and server routes.
If we removed it: Search crawlers could index administrative lead review interfaces.
Decided by: agent proposed, user approved
Status: active

### D-200 — Stage E1 — deviation
What: Introduce evaluation suite cases, pure metrics aggregation in evals/metrics.py, side-by-side comparison in evals/compare.py, and dedicated test runner in evals/tests.
Why: To systematically measure LLM prompt performance across multiple repeated runs rather than relying on single manual invocations, Stage E1 introduces the evaluation dataset in evals/cases/ and evaluation tools. evals/metrics.py is introduced as a pure calculation module containing run dataclasses and aggregation statistics (attempt-1 pass rate, final pass rate, fallback rate, code repair rate, average node counts, lint and error counts) with zero database, LLM, or app-layer imports. As a deviation approved by the user, tests live in evals/tests/test_evals.py rather than apps/api/tests/, preserving apps/api/pyproject.toml and its type-checker scope unchanged. scripts/check.ps1 receives one added step to run pytest on evals/tests from the apps/api virtual environment.
Alternatives considered:
1. Placing test_evals.py in apps/api/tests/: Rejected because it would require altering apps/api/pyproject.toml (adding repo-root to pythonpath and mypy_path), coupling the core API type-check scope to root developer tooling.
2. Inlining metric calculations into evals/compare.py: Rejected because separating pure aggregation into evals/metrics.py allows clean unit testing without CLI argument parsing or presentation overhead.
If we removed it: Prompt performance changes would remain anecdotal and could not be regression-tested deterministically across runs.
Decided by: agent proposed, user approved
Status: active

### D-157 — Phase 6 — design
What: Client-side local storage history helper (`apps/web/src/lib/history.ts`) under key `archnemesis.history.v1`.
Why: BUILD_PLAN.md:506 requires persisting past designs with schema `{design_id, title, created_at}`, newest first, capped at 20, with title derived from the first 60 characters of the brief summary. Reading is guarded by Zod validation, corrupt data is ignored, storage calls are wrapped in try/catch, and existing entries are deduplicated by `design_id`.
Alternatives considered: Server-side user accounts or unvalidated raw localStorage. Rejected because v1 has no user accounts and unvalidated storage risks runtime crashes.
If we removed it: Visitors would lose access to previously generated architectures upon leaving the page.
Decided by: agent proposed, user approved
Status: active

### D-200 — Stage E1 — deviation
What: Introduce evaluation suite cases, pure metrics aggregation in evals/metrics.py, side-by-side comparison in evals/compare.py, and dedicated test runner in evals/tests.
Why: To systematically measure LLM prompt performance across multiple repeated runs rather than relying on single manual invocations, Stage E1 introduces the evaluation dataset in evals/cases/ and evaluation tools. evals/metrics.py is introduced as a pure calculation module containing run dataclasses and aggregation statistics (attempt-1 pass rate, final pass rate, fallback rate, code repair rate, average node counts, lint and error counts) with zero database, LLM, or app-layer imports. As a deviation approved by the user, tests live in evals/tests/test_evals.py rather than apps/api/tests/, preserving apps/api/pyproject.toml and its type-checker scope unchanged. scripts/check.ps1 receives one added step to run pytest on evals/tests from the apps/api virtual environment.
Alternatives considered:
1. Placing test_evals.py in apps/api/tests/: Rejected because it would require altering apps/api/pyproject.toml (adding repo-root to pythonpath and mypy_path), coupling the core API type-check scope to root developer tooling.
2. Inlining metric calculations into evals/compare.py: Rejected because separating pure aggregation into evals/metrics.py allows clean unit testing without CLI argument parsing or presentation overhead.
If we removed it: Prompt performance changes would remain anecdotal and could not be regression-tested deterministically across runs.
Decided by: agent proposed, user approved
Status: active

### D-158 — Phase 6 — design
What: Display lead notes in full with word-wrapping as plain text in the admin leads table.
Why: Administrators reviewing leads need immediate, complete visibility into the prospective client's custom note without extra clicks or obscured information. Text is rendered strictly as React children to prevent any HTML or script execution.
Alternatives considered: Truncating with expand/collapse tooltip. Rejected per user preference for full cell visibility.
If we removed it: Notes would be truncated or hidden behind interaction toggles.
Decided by: agent proposed, user approved
Status: active

### D-200 — Stage E1 — deviation
What: Introduce evaluation suite cases, pure metrics aggregation in evals/metrics.py, side-by-side comparison in evals/compare.py, and dedicated test runner in evals/tests.
Why: To systematically measure LLM prompt performance across multiple repeated runs rather than relying on single manual invocations, Stage E1 introduces the evaluation dataset in evals/cases/ and evaluation tools. evals/metrics.py is introduced as a pure calculation module containing run dataclasses and aggregation statistics (attempt-1 pass rate, final pass rate, fallback rate, code repair rate, average node counts, lint and error counts) with zero database, LLM, or app-layer imports. As a deviation approved by the user, tests live in evals/tests/test_evals.py rather than apps/api/tests/, preserving apps/api/pyproject.toml and its type-checker scope unchanged. scripts/check.ps1 receives one added step to run pytest on evals/tests from the apps/api virtual environment.
Alternatives considered:
1. Placing test_evals.py in apps/api/tests/: Rejected because it would require altering apps/api/pyproject.toml (adding repo-root to pythonpath and mypy_path), coupling the core API type-check scope to root developer tooling.
2. Inlining metric calculations into evals/compare.py: Rejected because separating pure aggregation into evals/metrics.py allows clean unit testing without CLI argument parsing or presentation overhead.
If we removed it: Prompt performance changes would remain anecdotal and could not be regression-tested deterministically across runs.
Decided by: agent proposed, user approved
Status: active

### D-159 — Phase 6 — design
What: Admin design inspection page (`/admin/designs/[id]/[n]`) is strictly read-only and triggers zero POST/LLM requests.
Why: The admin route inspects historical snapshots returned by `GET /api/admin/designs/{id}/versions/{n}`. It reuses `DiagramView` and `ExplanationView` as pure presenter components. If the version has no explanation snapshot, it displays "No explanation generated yet." without triggering explanation generation.
Alternatives considered: Allowing admin to trigger `POST .../explanation`. Rejected because admin review must not mutate design version state or incur LLM generation costs.
If we removed it: Viewing designs in admin could accidentally trigger unwanted background LLM synthesis.
Decided by: agent proposed, user approved
Status: active

### D-200 — Stage E1 — deviation
What: Introduce evaluation suite cases, pure metrics aggregation in evals/metrics.py, side-by-side comparison in evals/compare.py, and dedicated test runner in evals/tests.
Why: To systematically measure LLM prompt performance across multiple repeated runs rather than relying on single manual invocations, Stage E1 introduces the evaluation dataset in evals/cases/ and evaluation tools. evals/metrics.py is introduced as a pure calculation module containing run dataclasses and aggregation statistics (attempt-1 pass rate, final pass rate, fallback rate, code repair rate, average node counts, lint and error counts) with zero database, LLM, or app-layer imports. As a deviation approved by the user, tests live in evals/tests/test_evals.py rather than apps/api/tests/, preserving apps/api/pyproject.toml and its type-checker scope unchanged. scripts/check.ps1 receives one added step to run pytest on evals/tests from the apps/api virtual environment.
Alternatives considered:
1. Placing test_evals.py in apps/api/tests/: Rejected because it would require altering apps/api/pyproject.toml (adding repo-root to pythonpath and mypy_path), coupling the core API type-check scope to root developer tooling.
2. Inlining metric calculations into evals/compare.py: Rejected because separating pure aggregation into evals/metrics.py allows clean unit testing without CLI argument parsing or presentation overhead.
If we removed it: Prompt performance changes would remain anecdotal and could not be regression-tested deterministically across runs.
Decided by: agent proposed, user approved
Status: active

### D-160 — Phase 6 — design
What: Backend left unchanged per Option C; frontend shows clear error alert on 500 when inspecting design versions.
Why: User opted for Option C to keep backend code strictly untouched in 6C1. If an older design version has an incomplete `brief_json` that causes a backend 500, the frontend catches the error and displays a clear descriptive alert message rather than crashing.
Alternatives considered: Modifying backend `service.py` to add validation fallbacks (Option A). Rejected per user direction to avoid backend modifications.
If we removed it: Incompatible stored brief versions would trigger uncaught UI crashes.
Decided by: agent proposed, user approved
Status: active

### D-200 — Stage E1 — deviation
What: Introduce evaluation suite cases, pure metrics aggregation in evals/metrics.py, side-by-side comparison in evals/compare.py, and dedicated test runner in evals/tests.
Why: To systematically measure LLM prompt performance across multiple repeated runs rather than relying on single manual invocations, Stage E1 introduces the evaluation dataset in evals/cases/ and evaluation tools. evals/metrics.py is introduced as a pure calculation module containing run dataclasses and aggregation statistics (attempt-1 pass rate, final pass rate, fallback rate, code repair rate, average node counts, lint and error counts) with zero database, LLM, or app-layer imports. As a deviation approved by the user, tests live in evals/tests/test_evals.py rather than apps/api/tests/, preserving apps/api/pyproject.toml and its type-checker scope unchanged. scripts/check.ps1 receives one added step to run pytest on evals/tests from the apps/api virtual environment.
Alternatives considered:
1. Placing test_evals.py in apps/api/tests/: Rejected because it would require altering apps/api/pyproject.toml (adding repo-root to pythonpath and mypy_path), coupling the core API type-check scope to root developer tooling.
2. Inlining metric calculations into evals/compare.py: Rejected because separating pure aggregation into evals/metrics.py allows clean unit testing without CLI argument parsing or presentation overhead.
If we removed it: Prompt performance changes would remain anecdotal and could not be regression-tested deterministically across runs.
Decided by: agent proposed, user approved
Status: active

### D-161 — Phase 6 — fix
What: shadcn add table pulled third-party "cn", removed, uses @/lib/utils (reference D-101).
Why: Running `npx shadcn add table` improperly installed the obsolete third-party package `"cn": "^0.5.1"` and imported from `"cn"`. Per D-101 and the project conventions, class names must be merged using the internal `@/lib/utils` helper (`clsx` + `tailwind-merge`). The third-party package was uninstalled, removed from `package.json` and `package-lock.json`, and `table.tsx` was adjusted to import `cn` from `@/lib/utils`.
Alternatives considered: Keeping the third-party package. Rejected because it violates repository conventions and dependency rules.
If we removed it: Extraneous unvetted dependency remains in project manifests.
Decided by: agent proposed, user approved
Status: active

### D-200 — Stage E1 — deviation
What: Introduce evaluation suite cases, pure metrics aggregation in evals/metrics.py, side-by-side comparison in evals/compare.py, and dedicated test runner in evals/tests.
Why: To systematically measure LLM prompt performance across multiple repeated runs rather than relying on single manual invocations, Stage E1 introduces the evaluation dataset in evals/cases/ and evaluation tools. evals/metrics.py is introduced as a pure calculation module containing run dataclasses and aggregation statistics (attempt-1 pass rate, final pass rate, fallback rate, code repair rate, average node counts, lint and error counts) with zero database, LLM, or app-layer imports. As a deviation approved by the user, tests live in evals/tests/test_evals.py rather than apps/api/tests/, preserving apps/api/pyproject.toml and its type-checker scope unchanged. scripts/check.ps1 receives one added step to run pytest on evals/tests from the apps/api virtual environment.
Alternatives considered:
1. Placing test_evals.py in apps/api/tests/: Rejected because it would require altering apps/api/pyproject.toml (adding repo-root to pythonpath and mypy_path), coupling the core API type-check scope to root developer tooling.
2. Inlining metric calculations into evals/compare.py: Rejected because separating pure aggregation into evals/metrics.py allows clean unit testing without CLI argument parsing or presentation overhead.
If we removed it: Prompt performance changes would remain anecdotal and could not be regression-tested deterministically across runs.
Decided by: agent proposed, user approved
Status: active

### D-162 — Phase 6 — fix
What: Preserve admin authentication error states independently of TanStack query key clearing.
Why: In both `/admin` and `/admin/designs/[id]/[n]`, clearing the in-memory `token` upon receiving HTTP 401 was changing the TanStack query key to `[..., null]`. Because queries with null tokens are disabled (`enabled: false`), the query cache for the null key has `error: null`, which immediately cleared the 401 error from the component tree and prevented the "Not authorised." alert from displaying. Decoupling authentication error feedback into dedicated local state (`authError`, `errorMessage`) and pre-populating TanStack Query cache via `queryClient.setQueryData` ensures the error alert remains visible above the password input and avoids duplicate network dispatches.
Alternatives considered: Leaving token in state on 401. Rejected because unauthenticated/invalid tokens must not linger in state.
If we removed it: Users entering an invalid admin token receive no visual feedback that authentication failed.
Decided by: user approved (Stage 6C1 test fix)
Status: active

### D-163 — Phase 6 — fix
What: Admin design page wrapped in Suspense, reference D-122.
Why: Next.js App Router (Turbopack/prerendering) reports a build error (`CLIENT_HOOK_DYNAMIC`) when `useParams()` is invoked in a client component outside of a `<Suspense>` boundary. Following the established pattern from D-122 for `/design/[id]`, the `useParams()` logic was moved into an inner component (`AdminDesignInspectionContent`) and wrapped in `<Suspense fallback={<AdminDesignInspectionLoading />}>` in the default export.
Alternatives considered: Using `export const instant = false` or `force-dynamic`. Rejected per user instruction and repository pattern in D-122.
If we removed it: Production builds fail during static analysis and prerendering due to un-sandboxed dynamic client hooks.
Decided by: user approved (Stage 6C1 build fix)
Status: active

### D-164 — Phase 6 — dependency
What: Add `html-to-image` (`1.11.11`) to `apps/web/package.json`.
Why: BUILD_PLAN.md:499 and 509 require client-side PNG export of the architecture diagram. React Flow documentation specifically recommends `html-to-image` targeting `.react-flow__viewport`. Version `1.11.11` is pinned per React Flow's recommendation for SVG stability, has zero dependencies, and has zero peer dependency constraints with React 19.
Alternatives considered: `dom-to-image` or server-side Puppeteer rendering. Rejected because `dom-to-image` is unmaintained and server-side rendering breaks client privacy rules and adds heavy infrastructure.
If we removed it: Visitors cannot take away a graphical PNG of their generated architecture.
Decided by: agent proposed, user approved
Status: active

### D-200 — Stage E1 — deviation
What: Introduce evaluation suite cases, pure metrics aggregation in evals/metrics.py, side-by-side comparison in evals/compare.py, and dedicated test runner in evals/tests.
Why: To systematically measure LLM prompt performance across multiple repeated runs rather than relying on single manual invocations, Stage E1 introduces the evaluation dataset in evals/cases/ and evaluation tools. evals/metrics.py is introduced as a pure calculation module containing run dataclasses and aggregation statistics (attempt-1 pass rate, final pass rate, fallback rate, code repair rate, average node counts, lint and error counts) with zero database, LLM, or app-layer imports. As a deviation approved by the user, tests live in evals/tests/test_evals.py rather than apps/api/tests/, preserving apps/api/pyproject.toml and its type-checker scope unchanged. scripts/check.ps1 receives one added step to run pytest on evals/tests from the apps/api virtual environment.
Alternatives considered:
1. Placing test_evals.py in apps/api/tests/: Rejected because it would require altering apps/api/pyproject.toml (adding repo-root to pythonpath and mypy_path), coupling the core API type-check scope to root developer tooling.
2. Inlining metric calculations into evals/compare.py: Rejected because separating pure aggregation into evals/metrics.py allows clean unit testing without CLI argument parsing or presentation overhead.
If we removed it: Prompt performance changes would remain anecdotal and could not be regression-tested deterministically across runs.
Decided by: agent proposed, user approved
Status: active

### D-165 — Phase 6 — design
What: Results page header export action buttons (`Download diagram (PNG)`, `Download explanation (.md)`, `Print or save as PDF`).
Why: BUILD_PLAN.md:509 mandates three export buttons on the results page next to "Contact our team". The buttons trigger purely in-memory browser actions: PNG canvas rendering via `html-to-image`, client-side blob download of markdown walkthrough, and native browser print dialog. Zero network requests or storage writes are performed.
Alternatives considered: Putting export actions in a sub-menu. Rejected to maintain direct discoverability for visitors taking designs away.
If we removed it: Visitors cannot export or print their generated architectures.
Decided by: agent proposed, user approved
Status: active

### D-200 — Stage E1 — deviation
What: Introduce evaluation suite cases, pure metrics aggregation in evals/metrics.py, side-by-side comparison in evals/compare.py, and dedicated test runner in evals/tests.
Why: To systematically measure LLM prompt performance across multiple repeated runs rather than relying on single manual invocations, Stage E1 introduces the evaluation dataset in evals/cases/ and evaluation tools. evals/metrics.py is introduced as a pure calculation module containing run dataclasses and aggregation statistics (attempt-1 pass rate, final pass rate, fallback rate, code repair rate, average node counts, lint and error counts) with zero database, LLM, or app-layer imports. As a deviation approved by the user, tests live in evals/tests/test_evals.py rather than apps/api/tests/, preserving apps/api/pyproject.toml and its type-checker scope unchanged. scripts/check.ps1 receives one added step to run pytest on evals/tests from the apps/api virtual environment.
Alternatives considered:
1. Placing test_evals.py in apps/api/tests/: Rejected because it would require altering apps/api/pyproject.toml (adding repo-root to pythonpath and mypy_path), coupling the core API type-check scope to root developer tooling.
2. Inlining metric calculations into evals/compare.py: Rejected because separating pure aggregation into evals/metrics.py allows clean unit testing without CLI argument parsing or presentation overhead.
If we removed it: Prompt performance changes would remain anecdotal and could not be regression-tested deterministically across runs.
Decided by: agent proposed, user approved
Status: active

### D-166 — Phase 6 — design
What: Pure client-side Markdown walkthrough generator with compliance banner in `apps/web/src/lib/export.ts`.
Why: BUILD_PLAN.md:509 requires downloading the plain-language walkthrough as `.md`. A pure tested function constructs GitHub-flavored markdown starting with the Design ID, version, and the exact compliance banner disclaimer, followed by the five walkthrough sections in order (`Overview`, `How a request flows`, `Each part`, `Why the checks exist`, `Where AI models are used`). Hostile user strings are rendered literally as plain text. If the explanation is null, Option A produces a valid document noting that the explanation has not yet been generated.
Alternatives considered: Sending request to backend to render Markdown. Rejected because all exports are client-side in v1.
If we removed it: Walkthrough cannot be exported as a portable document.
Decided by: agent proposed, user approved
Status: active

### D-200 — Stage E1 — deviation
What: Introduce evaluation suite cases, pure metrics aggregation in evals/metrics.py, side-by-side comparison in evals/compare.py, and dedicated test runner in evals/tests.
Why: To systematically measure LLM prompt performance across multiple repeated runs rather than relying on single manual invocations, Stage E1 introduces the evaluation dataset in evals/cases/ and evaluation tools. evals/metrics.py is introduced as a pure calculation module containing run dataclasses and aggregation statistics (attempt-1 pass rate, final pass rate, fallback rate, code repair rate, average node counts, lint and error counts) with zero database, LLM, or app-layer imports. As a deviation approved by the user, tests live in evals/tests/test_evals.py rather than apps/api/tests/, preserving apps/api/pyproject.toml and its type-checker scope unchanged. scripts/check.ps1 receives one added step to run pytest on evals/tests from the apps/api virtual environment.
Alternatives considered:
1. Placing test_evals.py in apps/api/tests/: Rejected because it would require altering apps/api/pyproject.toml (adding repo-root to pythonpath and mypy_path), coupling the core API type-check scope to root developer tooling.
2. Inlining metric calculations into evals/compare.py: Rejected because separating pure aggregation into evals/metrics.py allows clean unit testing without CLI argument parsing or presentation overhead.
If we removed it: Prompt performance changes would remain anecdotal and could not be regression-tested deterministically across runs.
Decided by: agent proposed, user approved
Status: active

### D-167 — Phase 6 — design
What: Scoped results page print layout and diagram print limitation documentation.
Why: BUILD_PLAN.md:509 mandates calling `window.print()` with a stylesheet that hides buttons and shows the banner, diagram, and explanation. Scoped CSS on the results page container displays both tab contents simultaneously during printing without altering global button or header styling on other pages or dialogs. We report honestly that native browser printing of interactive transformed canvas diagrams can suffer from omitted background graphics and boundary clipping.
Alternatives considered: Global print CSS rules hiding all buttons across the site. Rejected because it mutates dialog and admin print layouts unexpectedly.
If we removed it: Printing would hide the inactive tab content or print cluttered navigation controls.
Decided by: agent proposed, user approved
Status: active

### D-200 — Stage E1 — deviation
What: Introduce evaluation suite cases, pure metrics aggregation in evals/metrics.py, side-by-side comparison in evals/compare.py, and dedicated test runner in evals/tests.
Why: To systematically measure LLM prompt performance across multiple repeated runs rather than relying on single manual invocations, Stage E1 introduces the evaluation dataset in evals/cases/ and evaluation tools. evals/metrics.py is introduced as a pure calculation module containing run dataclasses and aggregation statistics (attempt-1 pass rate, final pass rate, fallback rate, code repair rate, average node counts, lint and error counts) with zero database, LLM, or app-layer imports. As a deviation approved by the user, tests live in evals/tests/test_evals.py rather than apps/api/tests/, preserving apps/api/pyproject.toml and its type-checker scope unchanged. scripts/check.ps1 receives one added step to run pytest on evals/tests from the apps/api virtual environment.
Alternatives considered:
1. Placing test_evals.py in apps/api/tests/: Rejected because it would require altering apps/api/pyproject.toml (adding repo-root to pythonpath and mypy_path), coupling the core API type-check scope to root developer tooling.
2. Inlining metric calculations into evals/compare.py: Rejected because separating pure aggregation into evals/metrics.py allows clean unit testing without CLI argument parsing or presentation overhead.
If we removed it: Prompt performance changes would remain anecdotal and could not be regression-tested deterministically across runs.
Decided by: agent proposed, user approved
Status: active

### D-168 — Phase 6 — fix
What: Convert diagram canvas data URL to binary PNG Blob and enforce design-id in export filename.
Why: `html-to-image` produces a base64 encoded data URL string (`data:image/png;base64,...`). Passing this string directly to `new Blob([content], { type: "image/png" })` packaged the ASCII text characters into a download rather than binary PNG bytes. We introduce `dataUrlToBlob` which decodes the base64 payload into a binary `Uint8Array` Blob with verified PNG signature header (`89 50 4E 47`), sanitize the filename format to guarantee `arch-nemesis-${id}-v${version}.png` (falling back safely to `arch-nemesis-design-v${version}.png`), and safeguard `downloadFile` so any passed data URL string is converted into a binary Blob rather than raw ASCII text.
Alternatives considered: Setting `anchor.href = dataUrl` directly. Rejected because large diagrams (data URLs exceeding browser URL length limits of ~2MB) can fail or truncate in Chromium/Firefox, whereas Object URLs created from binary Blobs scale reliably without memory leakage when revoked immediately after click.
If we removed it: Diagram PNG downloads would remain corrupted text files containing ASCII base64 strings instead of viewable image files.
Decided by: user approved (Stage 6C2 bug fix)
Status: active

### D-169 — Phase 6 — fix
What: Stub anchor click and adapt Blob reading in export unit tests for jsdom environment.
Why: jsdom's `Blob` implementation lacks `Blob.prototype.arrayBuffer()` and `Blob.prototype.text()` methods, causing vitest assertions to throw `is not a function`. Additionally, invoking `anchor.click()` in jsdom attempts navigation on temporary download anchors, outputting `Not implemented: navigation` errors. We added jsdom-safe readers (`readBlobAsArrayBuffer` and `readBlobAsText`) using `Response.arrayBuffer()`/`FileReader`, and stubbed `HTMLAnchorElement.prototype.click` in the test suite without altering production `export.ts` code.
Alternatives considered: Polyfilling `Blob.prototype.arrayBuffer` globally in vitest setup. Rejected because localized test-level readers are self-contained, predictable, and avoid unexpected side-effects across other test suites.
If we removed it: Vitest unit tests for file export and data URL conversion fail in the jsdom test environment.
Decided by: user approved (Stage 6C2 test fix)
Status: active

### D-170 — Phase 6 — fix
What: Prioritize FileReader over Response in export test helpers and add Blob read validation guards.
Why: In jsdom, passing a jsdom `Blob` instance to Node's `new Response(blob)` causes undici to stringify the object into the ASCII literal `"[object Blob]"` rather than throwing or decoding binary data, causing byte checks (e.g. expected 91 to be 137) and text checks to fail. We make `FileReader` (`readAsArrayBuffer` and `readAsText`) the primary read path, use `Response` only as fallback, and add explicit validation guards throwing if the buffer length is under 8 bytes or if the text result equals `"[object Blob]"`.
Alternatives considered: Passing mock ArrayBuffers directly. Rejected because testing the real `Blob` produced by `dataUrlToBlob` and `downloadFile` verifies actual MIME type and data integrity.
If we removed it: Vitest tests reading jsdom Blob instances would receive stringified `"[object Blob]"` payloads instead of actual file bytes.
Decided by: user approved (Stage 6C2 test fix)
Status: active

### D-171 — Phase 6 — deviation
What: Remove "Print or save as PDF" button and scoped print styles from the results page.
Why: Browser print layout and PDF generation severely degraded the architecture diagram by clipping boundary elements (only 4 of 6 nodes visible in test prints) and dropping SVG connecting edges. BUILD_PLAN.md:509 instructed: "If the diagram does not print properly the agent reports it instead of hacking around it." Client-side PNG export (`html-to-image`) and Markdown walkthrough export provide complete, faithful representations of the design, making a broken print-to-PDF output unnecessary and confusing.
Alternatives considered: Hacking SVG viewBox and CSS scale transforms for `@media print`. Rejected per explicit BUILD_PLAN.md:509 rule prohibiting print hacks.
If we removed it: Users would rely on an inconsistent print mechanism that omits nodes and edges from their exported architectures.
Decided by: agent proposed, user approved
Status: active

### D-200 — Stage E1 — deviation
What: Introduce evaluation suite cases, pure metrics aggregation in evals/metrics.py, side-by-side comparison in evals/compare.py, and dedicated test runner in evals/tests.
Why: To systematically measure LLM prompt performance across multiple repeated runs rather than relying on single manual invocations, Stage E1 introduces the evaluation dataset in evals/cases/ and evaluation tools. evals/metrics.py is introduced as a pure calculation module containing run dataclasses and aggregation statistics (attempt-1 pass rate, final pass rate, fallback rate, code repair rate, average node counts, lint and error counts) with zero database, LLM, or app-layer imports. As a deviation approved by the user, tests live in evals/tests/test_evals.py rather than apps/api/tests/, preserving apps/api/pyproject.toml and its type-checker scope unchanged. scripts/check.ps1 receives one added step to run pytest on evals/tests from the apps/api virtual environment.
Alternatives considered:
1. Placing test_evals.py in apps/api/tests/: Rejected because it would require altering apps/api/pyproject.toml (adding repo-root to pythonpath and mypy_path), coupling the core API type-check scope to root developer tooling.
2. Inlining metric calculations into evals/compare.py: Rejected because separating pure aggregation into evals/metrics.py allows clean unit testing without CLI argument parsing or presentation overhead.
If we removed it: Prompt performance changes would remain anecdotal and could not be regression-tested deterministically across runs.
Decided by: agent proposed, user approved
Status: active (supersedes D-165, D-167)

### D-172 — Phase 6 — fix
What: Isolate backend test suite from developer local .env files via autouse conftest fixture.
Why: `Settings` configures `model_config = SettingsConfigDict(env_file=".env")` so production applications read `.env`. In tests, calling `monkeypatch.delenv("ADMIN_TOKEN")` removed the variable from `os.environ`, but Pydantic's `Settings` instance fell back to reading developer `.env` files on disk, causing authentication tests (e.g. `test_admin_auth_unset_or_empty_token_returns_404`) to receive 401 instead of 404. We added an autouse fixture in `apps/api/tests/conftest.py` setting `Settings.model_config["env_file"] = None` and clearing `get_settings` cache, guaranteeing all tests run with clean code defaults regardless of developer local environment files.
Alternatives considered: Setting `ADMIN_TOKEN=""` in individual tests. Rejected because it fails to test the true unset state (`None`), and leaves other settings (`GEMINI_API_KEY`, `DATABASE_URL`, limits) vulnerable to leaking from local `.env` into test runs.
If we removed it: Tests checking unset environment variables or default settings would fail whenever a developer has secrets configured in their local `.env`.
Decided by: agent proposed, user approved
Status: active

### D-200 — Stage E1 — deviation
What: Introduce evaluation suite cases, pure metrics aggregation in evals/metrics.py, side-by-side comparison in evals/compare.py, and dedicated test runner in evals/tests.
Why: To systematically measure LLM prompt performance across multiple repeated runs rather than relying on single manual invocations, Stage E1 introduces the evaluation dataset in evals/cases/ and evaluation tools. evals/metrics.py is introduced as a pure calculation module containing run dataclasses and aggregation statistics (attempt-1 pass rate, final pass rate, fallback rate, code repair rate, average node counts, lint and error counts) with zero database, LLM, or app-layer imports. As a deviation approved by the user, tests live in evals/tests/test_evals.py rather than apps/api/tests/, preserving apps/api/pyproject.toml and its type-checker scope unchanged. scripts/check.ps1 receives one added step to run pytest on evals/tests from the apps/api virtual environment.
Alternatives considered:
1. Placing test_evals.py in apps/api/tests/: Rejected because it would require altering apps/api/pyproject.toml (adding repo-root to pythonpath and mypy_path), coupling the core API type-check scope to root developer tooling.
2. Inlining metric calculations into evals/compare.py: Rejected because separating pure aggregation into evals/metrics.py allows clean unit testing without CLI argument parsing or presentation overhead.
If we removed it: Prompt performance changes would remain anecdotal and could not be regression-tested deterministically across runs.
Decided by: agent proposed, user approved
Status: active

### D-173 — Phase 6 — fix
What: Provide dummy LLM model names in test isolation fixture to prevent LLM_NOT_CONFIGURED failures.
Why: Decision D-172 disabled reading `.env` during test runs, but neglected that service handlers in `test_architect.py`, `test_designs.py`, `test_intake.py`, and `test_quarantine.py` check `settings.llm_model_intake` and `settings.llm_model_architect` before dispatching to injected `FakeLLMClient` instances. With `.env` ignored, model names defaulted to `None`, causing 26 backend tests to fail with `LLM_NOT_CONFIGURED`. We updated `isolate_settings_from_env_file` in `apps/api/tests/conftest.py` to set dummy test values (`LLM_MODEL_INTAKE`, `LLM_MODEL_ARCHITECT`, `LLM_MODEL_WRITER = "test-model"`) in `os.environ`, kept `ADMIN_TOKEN` and `GEMINI_API_KEY` unset by default, and preserved explicit test-level unsetting for tests that test unconfigured states.
Alternatives considered: Hardcoding dummy model names into `Settings` defaults in `src/archnemesis/settings.py`. Rejected because production must enforce that model names are configured via environment variables, not hardcoded.
If we removed it: Backend service and endpoint tests would fail when run in clean CI environments or on developer machines without active `.env` files.
Decided by: agent proposed, user approved
Status: active

### D-200 — Stage E1 — deviation
What: Introduce evaluation suite cases, pure metrics aggregation in evals/metrics.py, side-by-side comparison in evals/compare.py, and dedicated test runner in evals/tests.
Why: To systematically measure LLM prompt performance across multiple repeated runs rather than relying on single manual invocations, Stage E1 introduces the evaluation dataset in evals/cases/ and evaluation tools. evals/metrics.py is introduced as a pure calculation module containing run dataclasses and aggregation statistics (attempt-1 pass rate, final pass rate, fallback rate, code repair rate, average node counts, lint and error counts) with zero database, LLM, or app-layer imports. As a deviation approved by the user, tests live in evals/tests/test_evals.py rather than apps/api/tests/, preserving apps/api/pyproject.toml and its type-checker scope unchanged. scripts/check.ps1 receives one added step to run pytest on evals/tests from the apps/api virtual environment.
Alternatives considered:
1. Placing test_evals.py in apps/api/tests/: Rejected because it would require altering apps/api/pyproject.toml (adding repo-root to pythonpath and mypy_path), coupling the core API type-check scope to root developer tooling.
2. Inlining metric calculations into evals/compare.py: Rejected because separating pure aggregation into evals/metrics.py allows clean unit testing without CLI argument parsing or presentation overhead.
If we removed it: Prompt performance changes would remain anecdotal and could not be regression-tested deterministically across runs.
Decided by: agent proposed, user approved
Status: active (supersedes D-172)

### D-174 — v2 Stage A — deviation
What: Introduce simple Block diagram view as the default diagram tab alongside technical Architecture view.
Why: Users evaluating agentic AI architectures benefit from a high-level, simplified conceptual diagram (boxes and directed arrows showing flow without technical metadata) as their first view, before delving into rich component specifications (roles, inputs/outputs, tech options, invariant constraints). This deviates from BUILD_PLAN.md:445 which specified only two tabs ("Diagram" and "Explanation"). We expanded the tabs to "Block diagram", "Architecture", and "Explanation", with "Block diagram" as default, non-interactive block nodes (name and Entry/Exit text markers only in one neutral style), directed arrows without flow labels, FallbackList below 768px, and dynamic PNG export capturing whichever diagram canvas is active.
Alternatives considered: Adding a toggle switch inside the existing Diagram view. Rejected because tabs make the two distinct conceptual views first-class and avoid hiding diagram modes behind nested settings.
If we removed it: Users would only have the detailed technical diagram view without an accessible high-level block diagram.
Decided by: agent proposed, user approved
Status: active

### D-200 — Stage E1 — deviation
What: Introduce evaluation suite cases, pure metrics aggregation in evals/metrics.py, side-by-side comparison in evals/compare.py, and dedicated test runner in evals/tests.
Why: To systematically measure LLM prompt performance across multiple repeated runs rather than relying on single manual invocations, Stage E1 introduces the evaluation dataset in evals/cases/ and evaluation tools. evals/metrics.py is introduced as a pure calculation module containing run dataclasses and aggregation statistics (attempt-1 pass rate, final pass rate, fallback rate, code repair rate, average node counts, lint and error counts) with zero database, LLM, or app-layer imports. As a deviation approved by the user, tests live in evals/tests/test_evals.py rather than apps/api/tests/, preserving apps/api/pyproject.toml and its type-checker scope unchanged. scripts/check.ps1 receives one added step to run pytest on evals/tests from the apps/api virtual environment.
Alternatives considered:
1. Placing test_evals.py in apps/api/tests/: Rejected because it would require altering apps/api/pyproject.toml (adding repo-root to pythonpath and mypy_path), coupling the core API type-check scope to root developer tooling.
2. Inlining metric calculations into evals/compare.py: Rejected because separating pure aggregation into evals/metrics.py allows clean unit testing without CLI argument parsing or presentation overhead.
If we removed it: Prompt performance changes would remain anecdotal and could not be regression-tested deterministically across runs.
Decided by: agent proposed, user approved
Status: active

### D-175 — v2 Stage B — deviation
What: Raise architecture graph limits to 25 nodes and 60 edges in settings.py and validation/models.py defaults.
Why: Detailed agentic AI architectures require parallel processing branches, fan-out/merge patterns, specialized reasoning agents, and supporting enterprise infrastructure (queues, caches, vector stores, guardrails, audit sinks) which exceed the original 15-node and 40-edge caps. We updated MAX_NODES to 25 and MAX_EDGES to 60 in Settings and Limits defaults, giving the LLM sufficient headroom to synthesize rich multi-agent systems without artificial truncation.
Alternatives considered: Raising limits to 50 nodes. Rejected because large graphs cause extreme canvas scaling degradation and risk LLM generation timeouts.
If we removed it: Complex agentic architectures would fail validation with E_NODE_LIMIT and E_EDGE_LIMIT.
Decided by: agent proposed, user approved
Status: active

### D-200 — Stage E1 — deviation
What: Introduce evaluation suite cases, pure metrics aggregation in evals/metrics.py, side-by-side comparison in evals/compare.py, and dedicated test runner in evals/tests.
Why: To systematically measure LLM prompt performance across multiple repeated runs rather than relying on single manual invocations, Stage E1 introduces the evaluation dataset in evals/cases/ and evaluation tools. evals/metrics.py is introduced as a pure calculation module containing run dataclasses and aggregation statistics (attempt-1 pass rate, final pass rate, fallback rate, code repair rate, average node counts, lint and error counts) with zero database, LLM, or app-layer imports. As a deviation approved by the user, tests live in evals/tests/test_evals.py rather than apps/api/tests/, preserving apps/api/pyproject.toml and its type-checker scope unchanged. scripts/check.ps1 receives one added step to run pytest on evals/tests from the apps/api virtual environment.
Alternatives considered:
1. Placing test_evals.py in apps/api/tests/: Rejected because it would require altering apps/api/pyproject.toml (adding repo-root to pythonpath and mypy_path), coupling the core API type-check scope to root developer tooling.
2. Inlining metric calculations into evals/compare.py: Rejected because separating pure aggregation into evals/metrics.py allows clean unit testing without CLI argument parsing or presentation overhead.
If we removed it: Prompt performance changes would remain anecdotal and could not be regression-tested deterministically across runs.
Decided by: agent proposed, user approved
Status: active

### D-176 — v2 Stage B — decision
What: Add non-blocking diagnostic warning lint W_NO_AI_NODE and update boundary test fixtures.
Why: Every architecture generated by Arch-Nemesis should feature specialized AI agent nodes (needs_model: true). Making this a non-blocking warning lint rather than a blocking error prevents exhausting the 3-attempt repair budget and failing user requests with 422 DESIGN_FAILED when an agent is not strictly required. Following lints.py convention, the warning populates ids with all node ids. We also updated validation boundary fixtures to test 25 nodes / 60 edges as valid and 26 nodes / 61 edges as boundary errors, replacing obsolete 16-node and 41-edge test fixtures.
Alternatives considered: Making absence of an AI agent a blocking error. Rejected because it dramatically increases 422 failure rates for simple tasks.
If we removed it: Systems generated without any AI models would pass silently without flagging the absence of an agent.
Decided by: agent proposed, user approved
Status: active

### D-200 — Stage E1 — deviation
What: Introduce evaluation suite cases, pure metrics aggregation in evals/metrics.py, side-by-side comparison in evals/compare.py, and dedicated test runner in evals/tests.
Why: To systematically measure LLM prompt performance across multiple repeated runs rather than relying on single manual invocations, Stage E1 introduces the evaluation dataset in evals/cases/ and evaluation tools. evals/metrics.py is introduced as a pure calculation module containing run dataclasses and aggregation statistics (attempt-1 pass rate, final pass rate, fallback rate, code repair rate, average node counts, lint and error counts) with zero database, LLM, or app-layer imports. As a deviation approved by the user, tests live in evals/tests/test_evals.py rather than apps/api/tests/, preserving apps/api/pyproject.toml and its type-checker scope unchanged. scripts/check.ps1 receives one added step to run pytest on evals/tests from the apps/api virtual environment.
Alternatives considered:
1. Placing test_evals.py in apps/api/tests/: Rejected because it would require altering apps/api/pyproject.toml (adding repo-root to pythonpath and mypy_path), coupling the core API type-check scope to root developer tooling.
2. Inlining metric calculations into evals/compare.py: Rejected because separating pure aggregation into evals/metrics.py allows clean unit testing without CLI argument parsing or presentation overhead.
If we removed it: Prompt performance changes would remain anecdotal and could not be regression-tested deterministically across runs.
Decided by: agent proposed, user approved
Status: active

### D-177 — v2 Stage B — decision
What: Introduce architect_v2.md and architect_repair_v2.md prompts and prompt constants.
Why: To guide the LLM to design branched, parallel architectures with specialized agents while leaving v1 prompts immutable. The prompt mandates forward DAG flow, parallel fan-out and merge at aggregators, illustrative architectural layers, multi-sentence roles, inputs/outputs labels, and tech options, with explicit warnings against artificial padding. Service layer defines ARCHITECT_PROMPT_NAME and ARCHITECT_REPAIR_PROMPT_NAME constants, storing prompt_version ("architect_v2" or "architect_v2+architect_repair_v2") per design version.
Alternatives considered: String replace tricks to determine repair prompt names. Rejected in favor of explicit constant declarations.
If we removed it: Generated designs would remain linear chains of 5-7 nodes resembling block diagrams.
Decided by: agent proposed, user approved
Status: active

### D-200 — Stage E1 — deviation
What: Introduce evaluation suite cases, pure metrics aggregation in evals/metrics.py, side-by-side comparison in evals/compare.py, and dedicated test runner in evals/tests.
Why: To systematically measure LLM prompt performance across multiple repeated runs rather than relying on single manual invocations, Stage E1 introduces the evaluation dataset in evals/cases/ and evaluation tools. evals/metrics.py is introduced as a pure calculation module containing run dataclasses and aggregation statistics (attempt-1 pass rate, final pass rate, fallback rate, code repair rate, average node counts, lint and error counts) with zero database, LLM, or app-layer imports. As a deviation approved by the user, tests live in evals/tests/test_evals.py rather than apps/api/tests/, preserving apps/api/pyproject.toml and its type-checker scope unchanged. scripts/check.ps1 receives one added step to run pytest on evals/tests from the apps/api virtual environment.
Alternatives considered:
1. Placing test_evals.py in apps/api/tests/: Rejected because it would require altering apps/api/pyproject.toml (adding repo-root to pythonpath and mypy_path), coupling the core API type-check scope to root developer tooling.
2. Inlining metric calculations into evals/compare.py: Rejected because separating pure aggregation into evals/metrics.py allows clean unit testing without CLI argument parsing or presentation overhead.
If we removed it: Prompt performance changes would remain anecdotal and could not be regression-tested deterministically across runs.
Decided by: agent proposed, user approved
Status: active

### D-178 — v2 Stage B — decision
What: Add domain-neutral branched reference patterns in prompts/patterns_v2/.
Why: Existing v1 reference patterns are 6-7 node linear chains that pull LLM generation toward simplistic topologies. We introduced three domain-neutral patterns in prompts/patterns_v2/ (parallel fan-out/merge, layered event pipeline, and validation-guarded delivery) demonstrating 10-12 node topologies with multi-agent coordination. load_patterns was updated with a version parameter defaulting to "v2" while preserving "v1" pattern access.
Alternatives considered: Editing existing patterns in-place. Rejected per project rule requiring prompt immutability and backwards compatibility.
If we removed it: The LLM few-shot context would continue to bias generation toward linear chains.
Decided by: agent proposed, user approved
Status: active

### D-200 — Stage E1 — deviation
What: Introduce evaluation suite cases, pure metrics aggregation in evals/metrics.py, side-by-side comparison in evals/compare.py, and dedicated test runner in evals/tests.
Why: To systematically measure LLM prompt performance across multiple repeated runs rather than relying on single manual invocations, Stage E1 introduces the evaluation dataset in evals/cases/ and evaluation tools. evals/metrics.py is introduced as a pure calculation module containing run dataclasses and aggregation statistics (attempt-1 pass rate, final pass rate, fallback rate, code repair rate, average node counts, lint and error counts) with zero database, LLM, or app-layer imports. As a deviation approved by the user, tests live in evals/tests/test_evals.py rather than apps/api/tests/, preserving apps/api/pyproject.toml and its type-checker scope unchanged. scripts/check.ps1 receives one added step to run pytest on evals/tests from the apps/api virtual environment.
Alternatives considered:
1. Placing test_evals.py in apps/api/tests/: Rejected because it would require altering apps/api/pyproject.toml (adding repo-root to pythonpath and mypy_path), coupling the core API type-check scope to root developer tooling.
2. Inlining metric calculations into evals/compare.py: Rejected because separating pure aggregation into evals/metrics.py allows clean unit testing without CLI argument parsing or presentation overhead.
If we removed it: Prompt performance changes would remain anecdotal and could not be regression-tested deterministically across runs.
Decided by: agent proposed, user approved
Status: active

### D-179 — v2 Stage B2 — step
What: Implement structured design_attempt, design_created, and code_repair event logging.
Why: BUILD_PLAN.md line 413 mandates structured logging events for generation attempts and design creations. We implemented design_attempt logging (attempt number, issue codes only) in architect/service.py after every validation check, design_created logging (design_id, node count, prompt version, model names) in designs/service.py, and code_repair logging (constraint ids, edges added count) when graph repair executes. Following Rule 6 and Rule 10, no user prompt text or raw LLM output is ever logged.
Alternatives considered: Logging full validation errors and prompt snippets. Rejected because user text is untrusted data and must remain out of log files.
If we removed it: Generation attempts and repair iterations would lack observable telemetry, making 422 diagnostic debugging impossible in production.
Decided by: agent proposed, user approved
Status: active

### D-200 — Stage E1 — deviation
What: Introduce evaluation suite cases, pure metrics aggregation in evals/metrics.py, side-by-side comparison in evals/compare.py, and dedicated test runner in evals/tests.
Why: To systematically measure LLM prompt performance across multiple repeated runs rather than relying on single manual invocations, Stage E1 introduces the evaluation dataset in evals/cases/ and evaluation tools. evals/metrics.py is introduced as a pure calculation module containing run dataclasses and aggregation statistics (attempt-1 pass rate, final pass rate, fallback rate, code repair rate, average node counts, lint and error counts) with zero database, LLM, or app-layer imports. As a deviation approved by the user, tests live in evals/tests/test_evals.py rather than apps/api/tests/, preserving apps/api/pyproject.toml and its type-checker scope unchanged. scripts/check.ps1 receives one added step to run pytest on evals/tests from the apps/api virtual environment.
Alternatives considered:
1. Placing test_evals.py in apps/api/tests/: Rejected because it would require altering apps/api/pyproject.toml (adding repo-root to pythonpath and mypy_path), coupling the core API type-check scope to root developer tooling.
2. Inlining metric calculations into evals/compare.py: Rejected because separating pure aggregation into evals/metrics.py allows clean unit testing without CLI argument parsing or presentation overhead.
If we removed it: Prompt performance changes would remain anecdotal and could not be regression-tested deterministically across runs.
Decided by: agent proposed, user approved
Status: active

### D-180 — v2 Stage B2 — design
What: Refine architect_v2.md, architect_repair_v2.md, and patterns_v2 with bottleneck routing and auxiliary sink guidelines.
Why: In branched architectures, LLM models frequently create parallel bypasses around required checkpoints (e.g. claim approval bypassing fraud detection) or mark early telemetry/audit sinks as exits, violating must_pass_through. We added an explicit Priority F reminder to architect_v2.md, updated architect_repair_v2.md with plain-language definitions and concrete graph rewiring instructions for all four constraint kinds, and added explicit instructions to patterns_v2 ensuring auxiliary sinks are fed after checkpoint nodes.
Alternatives considered: Relying only on raw error messages without graph-theoretic guidance. Rejected because the model repeatedly reintroduced bypasses.
If we removed it: The model would continue to exhaust repair attempts on complex requirements with parallel branches.
Decided by: agent proposed, user approved
Status: active

### D-200 — Stage E1 — deviation
What: Introduce evaluation suite cases, pure metrics aggregation in evals/metrics.py, side-by-side comparison in evals/compare.py, and dedicated test runner in evals/tests.
Why: To systematically measure LLM prompt performance across multiple repeated runs rather than relying on single manual invocations, Stage E1 introduces the evaluation dataset in evals/cases/ and evaluation tools. evals/metrics.py is introduced as a pure calculation module containing run dataclasses and aggregation statistics (attempt-1 pass rate, final pass rate, fallback rate, code repair rate, average node counts, lint and error counts) with zero database, LLM, or app-layer imports. As a deviation approved by the user, tests live in evals/tests/test_evals.py rather than apps/api/tests/, preserving apps/api/pyproject.toml and its type-checker scope unchanged. scripts/check.ps1 receives one added step to run pytest on evals/tests from the apps/api virtual environment.
Alternatives considered:
1. Placing test_evals.py in apps/api/tests/: Rejected because it would require altering apps/api/pyproject.toml (adding repo-root to pythonpath and mypy_path), coupling the core API type-check scope to root developer tooling.
2. Inlining metric calculations into evals/compare.py: Rejected because separating pure aggregation into evals/metrics.py allows clean unit testing without CLI argument parsing or presentation overhead.
If we removed it: Prompt performance changes would remain anecdotal and could not be regression-tested deterministically across runs.
Decided by: agent proposed, user approved
Status: active

### D-181 — v2 Stage B2 — fix
What: Introduce pure deterministic patch_constraints graph repair module in validation.
Why: To eliminate generation failures on complex branched briefs while respecting Rule 1 (code validates structure; LLM designs initial structure; code patches only to satisfy constraints). When must_pass_through or must_precede is violated by a bypass path, patch_constraints deterministically reroutes bypass edges through the required node using fixed neutral flows text ("Forward payload for verification"). The repair enforces cycle safety (NetworkX DAG check), edge limits (max 60), and exit-sink protection (structural sinks with out-degree 0 are fed downstream rather than converted to bottlenecks). Full validation runs immediately after patching.
Alternatives considered: Falling back to linear v1 prompt generation on repeated failure. Rejected because v1 linear chains destroy rich multi-agent structure.
If we removed it: Complex agentic architectures with parallel branches would frequently fail validation with 422 DESIGN_FAILED.
Decided by: agent proposed, user approved
Status: active

### D-200 — Stage E1 — deviation
What: Introduce evaluation suite cases, pure metrics aggregation in evals/metrics.py, side-by-side comparison in evals/compare.py, and dedicated test runner in evals/tests.
Why: To systematically measure LLM prompt performance across multiple repeated runs rather than relying on single manual invocations, Stage E1 introduces the evaluation dataset in evals/cases/ and evaluation tools. evals/metrics.py is introduced as a pure calculation module containing run dataclasses and aggregation statistics (attempt-1 pass rate, final pass rate, fallback rate, code repair rate, average node counts, lint and error counts) with zero database, LLM, or app-layer imports. As a deviation approved by the user, tests live in evals/tests/test_evals.py rather than apps/api/tests/, preserving apps/api/pyproject.toml and its type-checker scope unchanged. scripts/check.ps1 receives one added step to run pytest on evals/tests from the apps/api virtual environment.
Alternatives considered:
1. Placing test_evals.py in apps/api/tests/: Rejected because it would require altering apps/api/pyproject.toml (adding repo-root to pythonpath and mypy_path), coupling the core API type-check scope to root developer tooling.
2. Inlining metric calculations into evals/compare.py: Rejected because separating pure aggregation into evals/metrics.py allows clean unit testing without CLI argument parsing or presentation overhead.
If we removed it: Prompt performance changes would remain anecdotal and could not be regression-tested deterministically across runs.
Decided by: agent proposed, user approved
Status: active

### D-182 — v2 Stage B2 — deviation
What: Add non-blocking warning lint W_CODE_REPAIR_APPLIED and update contracts.md.
Why: Full user transparency requires notifying the user whenever automated graph alignment patches a specification. We added W_CODE_REPAIR_APPLIED to validation models, lints, and contracts.md with a fixed message template ("Constraint '{constraint_id}' satisfied by automated graph alignment: routed {count} edge(s) through '{target_id}'."). Prompt versions for repaired designs record "architect_v2+code_repair" or "architect_v2+architect_repair_v2+code_repair".
Alternatives considered: Silently applying code graph patches without user-visible notification. Rejected because Rule 12 and project transparency require disclosing all automated graph adjustments.
If we removed it: Users would have no indication that edge routing was adjusted by deterministic code repair rather than the LLM.
Decided by: agent proposed, user approved
Status: active

### D-200 — Stage E1 — deviation
What: Introduce evaluation suite cases, pure metrics aggregation in evals/metrics.py, side-by-side comparison in evals/compare.py, and dedicated test runner in evals/tests.
Why: To systematically measure LLM prompt performance across multiple repeated runs rather than relying on single manual invocations, Stage E1 introduces the evaluation dataset in evals/cases/ and evaluation tools. evals/metrics.py is introduced as a pure calculation module containing run dataclasses and aggregation statistics (attempt-1 pass rate, final pass rate, fallback rate, code repair rate, average node counts, lint and error counts) with zero database, LLM, or app-layer imports. As a deviation approved by the user, tests live in evals/tests/test_evals.py rather than apps/api/tests/, preserving apps/api/pyproject.toml and its type-checker scope unchanged. scripts/check.ps1 receives one added step to run pytest on evals/tests from the apps/api virtual environment.
Alternatives considered:
1. Placing test_evals.py in apps/api/tests/: Rejected because it would require altering apps/api/pyproject.toml (adding repo-root to pythonpath and mypy_path), coupling the core API type-check scope to root developer tooling.
2. Inlining metric calculations into evals/compare.py: Rejected because separating pure aggregation into evals/metrics.py allows clean unit testing without CLI argument parsing or presentation overhead.
If we removed it: Prompt performance changes would remain anecdotal and could not be regression-tested deterministically across runs.
Decided by: agent proposed, user approved
Status: active

### D-183 — v2 Stage B4a — deviation
What: Derive geometric node shapes from graph structure and AI metadata while preserving fixed 220x72 dimensions and existing border colors.
Why: BUILD_PLAN.md line 437 defined node visual style based solely on borders and badges, leaving all nodes as uniform rounded rectangles. To allow users to visually distinguish system boundaries (entry/exit) and AI nodes from standard software without inspecting text, we introduce structural shape mapping: pill for entry/exit endpoints, hexagon for needs_model AI nodes, and rounded rectangle for standard components. Following Rule 3, shape is strictly derived from topology and boolean metadata, never from component type text.
Alternatives considered: Keeping all nodes as rectangles or styling based on type strings. Rejected because uniform rectangles carry no visual meaning and styling from type text violates Rule 3.
If we removed it: Diagram nodes in both technical and block views would remain indistinguishable rectangles.
Decided by: agent proposed, user approved
Status: active

### D-200 — Stage E1 — deviation
What: Introduce evaluation suite cases, pure metrics aggregation in evals/metrics.py, side-by-side comparison in evals/compare.py, and dedicated test runner in evals/tests.
Why: To systematically measure LLM prompt performance across multiple repeated runs rather than relying on single manual invocations, Stage E1 introduces the evaluation dataset in evals/cases/ and evaluation tools. evals/metrics.py is introduced as a pure calculation module containing run dataclasses and aggregation statistics (attempt-1 pass rate, final pass rate, fallback rate, code repair rate, average node counts, lint and error counts) with zero database, LLM, or app-layer imports. As a deviation approved by the user, tests live in evals/tests/test_evals.py rather than apps/api/tests/, preserving apps/api/pyproject.toml and its type-checker scope unchanged. scripts/check.ps1 receives one added step to run pytest on evals/tests from the apps/api virtual environment.
Alternatives considered:
1. Placing test_evals.py in apps/api/tests/: Rejected because it would require altering apps/api/pyproject.toml (adding repo-root to pythonpath and mypy_path), coupling the core API type-check scope to root developer tooling.
2. Inlining metric calculations into evals/compare.py: Rejected because separating pure aggregation into evals/metrics.py allows clean unit testing without CLI argument parsing or presentation overhead.
If we removed it: Prompt performance changes would remain anecdotal and could not be regression-tested deterministically across runs.
Decided by: agent proposed, user approved
Status: active

### D-184 — v2 Stage B4b — deviation
What: Extend EdgeSpec with optional condition and NodeSpec with ai_role and tools while syncing needs_model.
Why: Branching decision architectures require labeled condition paths (e.g. "claim > $10k") and agentic systems require differentiating single-prompt model calls from multi-step tool-using agents. We added optional condition (str | None, max 100) to EdgeSpec, and ai_role (none | model | agent) and tools (list[str], max 5 items, max 60 chars each) to NodeSpec. Using model_validator(mode="before"), needs_model is bidirectionally synchronized so older stored designs without ai_role parse with 100% backward compatibility.
Alternatives considered: Removing needs_model entirely. Rejected because it would break existing database records and API consumers.
If we removed it: Decision branches would lack condition labels and agentic workflows could not be modeled with toolsets.
Decided by: agent proposed, user approved
Status: active

### D-200 — Stage E1 — deviation
What: Introduce evaluation suite cases, pure metrics aggregation in evals/metrics.py, side-by-side comparison in evals/compare.py, and dedicated test runner in evals/tests.
Why: To systematically measure LLM prompt performance across multiple repeated runs rather than relying on single manual invocations, Stage E1 introduces the evaluation dataset in evals/cases/ and evaluation tools. evals/metrics.py is introduced as a pure calculation module containing run dataclasses and aggregation statistics (attempt-1 pass rate, final pass rate, fallback rate, code repair rate, average node counts, lint and error counts) with zero database, LLM, or app-layer imports. As a deviation approved by the user, tests live in evals/tests/test_evals.py rather than apps/api/tests/, preserving apps/api/pyproject.toml and its type-checker scope unchanged. scripts/check.ps1 receives one added step to run pytest on evals/tests from the apps/api virtual environment.
Alternatives considered:
1. Placing test_evals.py in apps/api/tests/: Rejected because it would require altering apps/api/pyproject.toml (adding repo-root to pythonpath and mypy_path), coupling the core API type-check scope to root developer tooling.
2. Inlining metric calculations into evals/compare.py: Rejected because separating pure aggregation into evals/metrics.py allows clean unit testing without CLI argument parsing or presentation overhead.
If we removed it: Prompt performance changes would remain anecdotal and could not be regression-tested deterministically across runs.
Decided by: agent proposed, user approved
Status: active

### D-185 — v2 Stage B4b — decision
What: Add non-blocking warning lint W_AGENT_WITHOUT_TOOLS and update contracts.md.
Why: If a node is explicitly configured as an autonomous agent (ai_role: "agent"), it should declare the specific toolsets it utilizes. We added W_AGENT_WITHOUT_TOOLS ("Agent node '{id}' is declared as an agent but lists no tools.") to validation models, lints, and contracts.md. Following lints.py conventions, it produces a non-blocking diagnostic warning under Notes without failing validation.
Alternatives considered: Making missing tools a blocking validation error. Rejected because it would exhaust repair budgets on early drafts.
If we removed it: Agents declared without tools would pass without highlighting missing integrations.
Decided by: agent proposed, user approved
Status: active

### D-200 — Stage E1 — deviation
What: Introduce evaluation suite cases, pure metrics aggregation in evals/metrics.py, side-by-side comparison in evals/compare.py, and dedicated test runner in evals/tests.
Why: To systematically measure LLM prompt performance across multiple repeated runs rather than relying on single manual invocations, Stage E1 introduces the evaluation dataset in evals/cases/ and evaluation tools. evals/metrics.py is introduced as a pure calculation module containing run dataclasses and aggregation statistics (attempt-1 pass rate, final pass rate, fallback rate, code repair rate, average node counts, lint and error counts) with zero database, LLM, or app-layer imports. As a deviation approved by the user, tests live in evals/tests/test_evals.py rather than apps/api/tests/, preserving apps/api/pyproject.toml and its type-checker scope unchanged. scripts/check.ps1 receives one added step to run pytest on evals/tests from the apps/api virtual environment.
Alternatives considered:
1. Placing test_evals.py in apps/api/tests/: Rejected because it would require altering apps/api/pyproject.toml (adding repo-root to pythonpath and mypy_path), coupling the core API type-check scope to root developer tooling.
2. Inlining metric calculations into evals/compare.py: Rejected because separating pure aggregation into evals/metrics.py allows clean unit testing without CLI argument parsing or presentation overhead.
If we removed it: Prompt performance changes would remain anecdotal and could not be regression-tested deterministically across runs.
Decided by: agent proposed, user approved
Status: active

### D-186 — v2 Stage B4b — deviation
What: Introduce diamond decision nodes, agent double rings, and condition badges in the frontend.
Why: To reflect edge conditions and agentic roles on the interactive canvas without violating Rule 3 (no type-based styling). We added diamond card shapes for nodes with 2+ outgoing edges where at least one edge has a condition, double-ring outlines and "Agent" badges for ai_role="agent", condition badges on edge paths, and "Tools (suggested)" sections in DetailPanel. Classify priority is strictly: entry/exit pill > diamond decision > hexagon AI > rectangle code.
Alternatives considered: Using different background colors for decisions and agents. Rejected per user mandate to preserve the four core plan colors.
If we removed it: Visual branching decisions and agentic distinction would not be visible on the canvas.
Decided by: agent proposed, user approved
Status: active

### D-200 — Stage E1 — deviation
What: Introduce evaluation suite cases, pure metrics aggregation in evals/metrics.py, side-by-side comparison in evals/compare.py, and dedicated test runner in evals/tests.
Why: To systematically measure LLM prompt performance across multiple repeated runs rather than relying on single manual invocations, Stage E1 introduces the evaluation dataset in evals/cases/ and evaluation tools. evals/metrics.py is introduced as a pure calculation module containing run dataclasses and aggregation statistics (attempt-1 pass rate, final pass rate, fallback rate, code repair rate, average node counts, lint and error counts) with zero database, LLM, or app-layer imports. As a deviation approved by the user, tests live in evals/tests/test_evals.py rather than apps/api/tests/, preserving apps/api/pyproject.toml and its type-checker scope unchanged. scripts/check.ps1 receives one added step to run pytest on evals/tests from the apps/api virtual environment.
Alternatives considered:
1. Placing test_evals.py in apps/api/tests/: Rejected because it would require altering apps/api/pyproject.toml (adding repo-root to pythonpath and mypy_path), coupling the core API type-check scope to root developer tooling.
2. Inlining metric calculations into evals/compare.py: Rejected because separating pure aggregation into evals/metrics.py allows clean unit testing without CLI argument parsing or presentation overhead.
If we removed it: Prompt performance changes would remain anecdotal and could not be regression-tested deterministically across runs.
Decided by: agent proposed, user approved
Status: active

### D-187 — v2 Stage B4e1 — deviation
What: Switch diagram layout to vertical top-to-bottom (rankdir TB), fixed node width 240px, and content-computed node height.
Why: BUILD_PLAN.md line 436 stipulated left-to-right (LR) Dagre layout with fixed 220x72 rectangular nodes. In live complex architectures (e.g. 11+ nodes with branching), horizontal layout caused excessive horizontal scrolling and node names/roles were truncated inside shapes (hexagons, diamonds). We switch to vertical top-to-bottom layout (TB), increase node width to 240px, and dynamically compute node height per node based on text length clamped by shape constraints (rectangle/pill 80-130px, hexagon 86-140px, diamond 110-160px). Handles are relocated to top (target) and bottom (source).
Alternatives considered: Retaining fixed 220x72 boxes with CSS ellipsis. Rejected because text is prematurely clipped and diamond/hexagon shapes suffer severe corner clipping without dynamic height scaling.
If we removed it: Text would remain cut off inside non-rectangular nodes and deep branched architectures would require wide horizontal panning.
Decided by: agent proposed, user approved
Status: active

### D-200 — Stage E1 — deviation
What: Introduce evaluation suite cases, pure metrics aggregation in evals/metrics.py, side-by-side comparison in evals/compare.py, and dedicated test runner in evals/tests.
Why: To systematically measure LLM prompt performance across multiple repeated runs rather than relying on single manual invocations, Stage E1 introduces the evaluation dataset in evals/cases/ and evaluation tools. evals/metrics.py is introduced as a pure calculation module containing run dataclasses and aggregation statistics (attempt-1 pass rate, final pass rate, fallback rate, code repair rate, average node counts, lint and error counts) with zero database, LLM, or app-layer imports. As a deviation approved by the user, tests live in evals/tests/test_evals.py rather than apps/api/tests/, preserving apps/api/pyproject.toml and its type-checker scope unchanged. scripts/check.ps1 receives one added step to run pytest on evals/tests from the apps/api virtual environment.
Alternatives considered:
1. Placing test_evals.py in apps/api/tests/: Rejected because it would require altering apps/api/pyproject.toml (adding repo-root to pythonpath and mypy_path), coupling the core API type-check scope to root developer tooling.
2. Inlining metric calculations into evals/compare.py: Rejected because separating pure aggregation into evals/metrics.py allows clean unit testing without CLI argument parsing or presentation overhead.
If we removed it: Prompt performance changes would remain anecdotal and could not be regression-tested deterministically across runs.
Decided by: agent proposed, user approved
Status: active

### D-188 — v2 Stage B4e1 — fix
What: Fix diamond node text overflow by constraining content to a centered inner box and expanding diamond height clamp to 140-190px.
Why: Fixes D-187. In diamond nodes (rhombus), diagonal boundaries converge toward the top and bottom vertices. In D-187, DiagramNode used justify-between and BlockNode used top/bottom rows across the full outer bounding box (240px wide), pushing name and type to the top vertex and role and badges (AI model, Agent) to the bottom vertex, causing text and badges to render outside the diamond stroke. We constrain diamond node content to a centered inner box (DIAMOND_INNER_WIDTH = 112px, roughly 46.7% of node width, and max-height ~52% of node height), restrict role to max 1 line in diamond view, place badges and lock icons inside the centered inner box, and increase diamond height clamp to [140, 190]px in computeNodeDimensions so Dagre allocates adequate vertical rank spacing matching rendered dimensions.
Alternatives considered: Expanding node width beyond 240px or keeping top/bottom justify-between layout with huge padding. Rejected because width 240px is fixed per plan and rhombus geometry requires central positioning.
If we removed it: Text, badges, and lock icons in diamond decision nodes would spill outside the SVG polygon outlines.
Decided by: user reported bug, agent fixed
Status: active

### D-189 — v2 Stage B4e2 — decision
What: Implement collision-free edge label placement with column divergence, multi-rank Dagre cubic paths, and MIN_RANKSEP = 110.
Why: In B4e1 vertical (TB) layout, sibling edge labels fanning out from a common source or fanning into a common target shared identical bezier midpoints (t = 0.5), causing horizontal label overlap. We introduce pure computeEdgeLabelLayout in layout.ts with hybrid column divergence: fan-out labels placed toward the target end (t in [0.58, 0.70]) where parallel target columns diverge by 290px (well exceeding 168px label width), fan-in labels placed toward the source end (t in [0.30, 0.42]) where source columns are separated by 290px, parallel edges offset laterally and vertically, multi-rank edges routed through Dagre waypoints with labels placed in the first rank gap, and MIN_RANKSEP increased from 96px to 110px to guarantee >= 11.6px clearance (> 8px requirement) between labels (including condition badges) and node rectangles.
Alternatives considered: Pure t-staggering without column divergence (rejected: vertical gap cannot fit multiple 26-52px labels without overlap) or hiding flows labels behind hover (rejected: breaks BUILD_PLAN.md requirement for visible labels).
If we removed it: Edge labels in multi-branch architectures (such as 12-node insurance claims) would collide horizontally and multi-rank lines would slice through intermediate nodes.
Decided by: agent proposed, user approved
Status: active

### D-200 — Stage E1 — deviation
What: Introduce evaluation suite cases, pure metrics aggregation in evals/metrics.py, side-by-side comparison in evals/compare.py, and dedicated test runner in evals/tests.
Why: To systematically measure LLM prompt performance across multiple repeated runs rather than relying on single manual invocations, Stage E1 introduces the evaluation dataset in evals/cases/ and evaluation tools. evals/metrics.py is introduced as a pure calculation module containing run dataclasses and aggregation statistics (attempt-1 pass rate, final pass rate, fallback rate, code repair rate, average node counts, lint and error counts) with zero database, LLM, or app-layer imports. As a deviation approved by the user, tests live in evals/tests/test_evals.py rather than apps/api/tests/, preserving apps/api/pyproject.toml and its type-checker scope unchanged. scripts/check.ps1 receives one added step to run pytest on evals/tests from the apps/api virtual environment.
Alternatives considered:
1. Placing test_evals.py in apps/api/tests/: Rejected because it would require altering apps/api/pyproject.toml (adding repo-root to pythonpath and mypy_path), coupling the core API type-check scope to root developer tooling.
2. Inlining metric calculations into evals/compare.py: Rejected because separating pure aggregation into evals/metrics.py allows clean unit testing without CLI argument parsing or presentation overhead.
If we removed it: Prompt performance changes would remain anecdotal and could not be regression-tested deterministically across runs.
Decided by: agent proposed, user approved
Status: active

### D-190 — v2 Stage B4c — decision
What: Introduce architect_v3.md and architect_repair_v3.md prompts with decision edge conditions, dedicated human nodes, and explicit AI role taxonomy.
Why: To reflect branching decisions and multi-agent roles introduced in B4b (EdgeSpec condition, NodeSpec ai_role and tools) without changing immutable v1/v2 prompts. The v3 prompt specifies that decision points with alternative paths must label outgoing edges with short condition text, mandates dedicated human review/approval nodes (ai_role: "none", needs_model: false) rather than embedding human tasks in AI nodes, defines precise taxonomy distinguishing single-judgment models (ai_role: "model") from multi-step tool-using agents (ai_role: "agent", 1-5 tools), generalizes layer and tech_options examples to neutral technology types without specific framework/product names, and appends preservation rules to repair_v3 for conditions and human nodes.
Alternatives considered: Mutating architect_v2.md in place. Rejected per project rule requiring prompt immutability and backwards compatibility across prompt versions.
If we removed it: The LLM would generate architectures without condition labels on branching edges, hide human review inside AI nodes, confuse single models with multi-step agents, and output concrete product names in tech options.
Decided by: agent proposed, user approved
Status: active

### D-200 — Stage E1 — deviation
What: Introduce evaluation suite cases, pure metrics aggregation in evals/metrics.py, side-by-side comparison in evals/compare.py, and dedicated test runner in evals/tests.
Why: To systematically measure LLM prompt performance across multiple repeated runs rather than relying on single manual invocations, Stage E1 introduces the evaluation dataset in evals/cases/ and evaluation tools. evals/metrics.py is introduced as a pure calculation module containing run dataclasses and aggregation statistics (attempt-1 pass rate, final pass rate, fallback rate, code repair rate, average node counts, lint and error counts) with zero database, LLM, or app-layer imports. As a deviation approved by the user, tests live in evals/tests/test_evals.py rather than apps/api/tests/, preserving apps/api/pyproject.toml and its type-checker scope unchanged. scripts/check.ps1 receives one added step to run pytest on evals/tests from the apps/api virtual environment.
Alternatives considered:
1. Placing test_evals.py in apps/api/tests/: Rejected because it would require altering apps/api/pyproject.toml (adding repo-root to pythonpath and mypy_path), coupling the core API type-check scope to root developer tooling.
2. Inlining metric calculations into evals/compare.py: Rejected because separating pure aggregation into evals/metrics.py allows clean unit testing without CLI argument parsing or presentation overhead.
If we removed it: Prompt performance changes would remain anecdotal and could not be regression-tested deterministically across runs.
Decided by: agent proposed, user approved
Status: active

### D-191 — v2 Stage B5 — decision
What: Introduce architect_v4.md, architect_repair_v4.md, and patterns_v4 with explicit sink-exit declarations and post-checkpoint routing.
Why: In branched architectures, LLMs frequently include auxiliary components (such as audit logs, telemetry sinks, and data stores) that have no outgoing edges. In v3 prompts, these dead ends triggered E_CANNOT_REACH_EXIT because they were omitted from exit_ids. When the repair prompt instructed the model to avoid dead ends, adding them to exit_ids caused E_CONSTRAINT_VIOLATED because pre-checkpoint edges (e.g. from ingress) bypassed required gatekeepers. We introduce architect_v4.md, architect_repair_v4.md, and prompts/patterns_v4/ (with load_patterns defaulting to v4 while keeping v2 loadable). The v4 prompt mandates that every node must reach an exit, specifies that dead-end sinks must be listed in exit_ids, and instructs that auxiliary sinks must be fed only from nodes at or after required checkpoints (never directly from ingress). The repair prompt removes any suggestion to unmark exits, directing the model instead to reroute incoming bypass edges to originate from the required checkpoint.
Alternatives considered: Editing v3 in place. Rejected per project rule requiring prompt immutability across prompt versions.
If we removed it: Complex designs with audit sinks would repeatedly oscillate between E_CANNOT_REACH_EXIT and E_CONSTRAINT_VIOLATED across all 3 repair attempts, resulting in 422 DESIGN_FAILED.
Decided by: agent proposed, user approved
Status: active

### D-200 — Stage E1 — deviation
What: Introduce evaluation suite cases, pure metrics aggregation in evals/metrics.py, side-by-side comparison in evals/compare.py, and dedicated test runner in evals/tests.
Why: To systematically measure LLM prompt performance across multiple repeated runs rather than relying on single manual invocations, Stage E1 introduces the evaluation dataset in evals/cases/ and evaluation tools. evals/metrics.py is introduced as a pure calculation module containing run dataclasses and aggregation statistics (attempt-1 pass rate, final pass rate, fallback rate, code repair rate, average node counts, lint and error counts) with zero database, LLM, or app-layer imports. As a deviation approved by the user, tests live in evals/tests/test_evals.py rather than apps/api/tests/, preserving apps/api/pyproject.toml and its type-checker scope unchanged. scripts/check.ps1 receives one added step to run pytest on evals/tests from the apps/api virtual environment.
Alternatives considered:
1. Placing test_evals.py in apps/api/tests/: Rejected because it would require altering apps/api/pyproject.toml (adding repo-root to pythonpath and mypy_path), coupling the core API type-check scope to root developer tooling.
2. Inlining metric calculations into evals/compare.py: Rejected because separating pure aggregation into evals/metrics.py allows clean unit testing without CLI argument parsing or presentation overhead.
If we removed it: Prompt performance changes would remain anecdotal and could not be regression-tested deterministically across runs.
Decided by: agent proposed, user approved
Status: active

### D-192 — v2 Stage B5 — decision
What: Implement deterministic patch_dead_ends graph repair in validation/repair.py.
Why: When the LLM produces a specification containing nodes with in-degree > 0 and out-degree == 0 that are omitted from exit_ids, patch_dead_ends deterministically repairs the graph without requiring additional LLM calls. It adds the unlisted sink nodes to exit_ids. If this creates a must_pass_through or must_precede violation due to pre-checkpoint bypass edges, it reroutes the bypass edges to originate from the required checkpoint node. The repair is accepted only if full validation passes and limits hold; otherwise the original specification is preserved. It emits W_CODE_REPAIR_APPLIED with the exact node and edge modifications, executing in deterministic order sorted by node ID.
Alternatives considered: Connecting dead-end sinks to other exit nodes. Rejected because connecting an audit database to a customer webhook creates nonsensical physical architecture.
If we removed it: Any LLM omission of a sink node from exit_ids would consume repair call budget or fail generation.
Decided by: agent proposed, user approved
Status: active

### D-200 — Stage E1 — deviation
What: Introduce evaluation suite cases, pure metrics aggregation in evals/metrics.py, side-by-side comparison in evals/compare.py, and dedicated test runner in evals/tests.
Why: To systematically measure LLM prompt performance across multiple repeated runs rather than relying on single manual invocations, Stage E1 introduces the evaluation dataset in evals/cases/ and evaluation tools. evals/metrics.py is introduced as a pure calculation module containing run dataclasses and aggregation statistics (attempt-1 pass rate, final pass rate, fallback rate, code repair rate, average node counts, lint and error counts) with zero database, LLM, or app-layer imports. As a deviation approved by the user, tests live in evals/tests/test_evals.py rather than apps/api/tests/, preserving apps/api/pyproject.toml and its type-checker scope unchanged. scripts/check.ps1 receives one added step to run pytest on evals/tests from the apps/api virtual environment.
Alternatives considered:
1. Placing test_evals.py in apps/api/tests/: Rejected because it would require altering apps/api/pyproject.toml (adding repo-root to pythonpath and mypy_path), coupling the core API type-check scope to root developer tooling.
2. Inlining metric calculations into evals/compare.py: Rejected because separating pure aggregation into evals/metrics.py allows clean unit testing without CLI argument parsing or presentation overhead.
If we removed it: Prompt performance changes would remain anecdotal and could not be regression-tested deterministically across runs.
Decided by: agent proposed, user approved
Status: active

### D-193 — Stage N1 — decision
What: Add "New design" button on results and history pages navigating to /?new=1 with Suspense-wrapped fresh state reset.
Why: Users finishing a design or reviewing past designs need an explicit way to start a fresh design intake without retaining previous chat dialogue, session ID, brief cards, input text, or errors. Automatic reset on plain browser Back navigation was rejected per user requirement to preserve ongoing sessions during accidental Back navigation. We added an accessible "New design" button to the results page header (/design/[id]) and history page (/history), navigating to /?new=1. On the home page (/), an inner HomeContent reads useSearchParams(); when new=1 is detected, it clears all local chat, session, brief, and mutation state, and silently cleans the URL to / using router.replace('/', { scroll: false }). To prevent Next.js App Router prerender errors (useSearchParams() should be wrapped in a suspense boundary, per D-122 and D-163), HomeContent is wrapped in Suspense with a lightweight HomeLoading shell fallback in the default export.
Alternatives considered: Automatic reset on any Back navigation to / (rejected: destroys in-progress draft on accidental back navigation); reading from window.location directly (rejected: breaks Next.js client-side navigation hydration).
If we removed it: Users would have to manually refresh the browser to start a new architecture session after viewing a design or history.
Decided by: user requested, agent implemented
Status: active

### D-194 — Stage N2 — decision
What: Restore intake conversation and brief state on browser Back navigation using tab-scoped versioned sessionStorage.
Why: When users navigate back to the home page (e.g. via browser Back button) after generating a design or during multi-turn intake, losing the dialogue transcript and generated brief forces unnecessary re-prompting. In N1, the "New design" button was introduced to explicitly request a clean slate (?new=1). For natural Back navigation, we now persist the active intake session state in browser sessionStorage (tab-scoped, ephemeral, automatically destroyed when the browser tab closes). User privacy is strictly preserved: text stays entirely within the client tab's ephemeral storage, never written to persistent server storage or localStorage, never logged, and capped at 500 KB to prevent quota exhaustion. Reading from sessionStorage validates the payload against a strict Zod schema (versioned archnemesis.intake.v1) to gracefully ignore corrupted, incompatible, or tampered records without throwing errors. If a user subsequently attempts to submit further messages into an already finalized session, the UI intercepts HTTP 409 SESSION_CLOSED and presents a polite guidance message ("This design request is finished. Use New design to start another.") rather than a raw server error.
Alternatives considered: Persisting in localStorage (rejected due to privacy risks and cross-tab leakage); storing draft sessions on backend with session cookies (rejected to avoid storing draft data or cookies without consent); no persistence (rejected because React component state is destroyed on navigation).
If we removed it: Pressing the browser Back button after generating a design would show a blank home screen, losing all context from the preceding conversation.
Decided by: user requested, agent implemented
Status: active

### D-195 — Stage B6a — decision
What: Add W_MERGE_AS_AGENT non-blocking lint, refine auxiliary sink exit recognition in repair.py, and rename architect log field to edges_net_change.
Why: In design 42a685da..., three issues surfaced: (1) merge/join nodes receiving inputs from parallel branches were unnecessarily tagged as AI agents and models, giving them diamond/hexagon shapes and agent badges; (2) _is_sink_exit disqualified nodes referenced in any constraint (including must_exist) from being recognized as auxiliary sinks, which caused code repair to route an entry-side bypass edge (intake_guardrail -> output_validator) across 8 ranks to satisfy a must_pass_through constraint; and (3) architect service logged edges_added_count with negative values when repair removed more edges than it added. In B6a: (1) W_MERGE_AS_AGENT is added as a purely structural, non-blocking lint (in-degree >= 2 AND needs_model true OR ai_role in agent/model) with fixed message template; (2) _is_sink_exit is refined so nodes referenced only in must_exist constraints remain eligible as auxiliary sink exits, preventing spurious cross-diagram bypass edges while preserving strict disqualification for must_pass_through, must_precede, and must_not_connect; and (3) edges_added_count is renamed to edges_net_change in structured logs.
Alternatives considered:
1. Blocking 422 error for merge nodes as agents: Rejected because some business needs legitimately require qualitative LLM synthesis at join points; warnings must remain non-blocking.
2. Requiring "no outgoing condition edges" in W_MERGE_AS_AGENT: Rejected because real merge/decision nodes carry conditions on alternative paths and must still trigger the lint.
3. Completely removing constraint checks from _is_sink_exit: Rejected because nodes that serve as must_pass_through bottlenecks or ordering points cannot be treated as terminal sinks.
If we removed it: Merges would continue to be styled as agents without developer feedback, and audit stores mentioned in must_exist rules would continue to trigger long cross-rank bypass edges during code repair.
Decided by: agent proposed, user approved
Status: active

### D-200 — Stage E1 — deviation
What: Introduce evaluation suite cases, pure metrics aggregation in evals/metrics.py, side-by-side comparison in evals/compare.py, and dedicated test runner in evals/tests.
Why: To systematically measure LLM prompt performance across multiple repeated runs rather than relying on single manual invocations, Stage E1 introduces the evaluation dataset in evals/cases/ and evaluation tools. evals/metrics.py is introduced as a pure calculation module containing run dataclasses and aggregation statistics (attempt-1 pass rate, final pass rate, fallback rate, code repair rate, average node counts, lint and error counts) with zero database, LLM, or app-layer imports. As a deviation approved by the user, tests live in evals/tests/test_evals.py rather than apps/api/tests/, preserving apps/api/pyproject.toml and its type-checker scope unchanged. scripts/check.ps1 receives one added step to run pytest on evals/tests from the apps/api virtual environment.
Alternatives considered:
1. Placing test_evals.py in apps/api/tests/: Rejected because it would require altering apps/api/pyproject.toml (adding repo-root to pythonpath and mypy_path), coupling the core API type-check scope to root developer tooling.
2. Inlining metric calculations into evals/compare.py: Rejected because separating pure aggregation into evals/metrics.py allows clean unit testing without CLI argument parsing or presentation overhead.
If we removed it: Prompt performance changes would remain anecdotal and could not be regression-tested deterministically across runs.
Decided by: agent proposed, user approved
Status: active

### D-196 — Stage B6c — decision
What: Safe error diagnostics and field-targeted feedback on explainer schema validation failures.
Why: When the LLM technical writer produces an ExplanationDraft that fails Pydantic schema validation (e.g. models_text or flow_step exceeding character limits), generic X_BAD_OUTPUT was logged without field paths, and Attempt 2 received no specific guidance on which field failed, causing repeated fallback to the code-only explanation. In B6c, we: (1) enrich explainer_verify_failed structured logs with strictly safe metadata (error_type; for PydanticValidationError: error_count and failing_fields formatted as "loc.path:error_type" capped at 10 items; for LLMBadOutput: error_type and raw byte count), never logging prompts, model prose, node names, or input values; (2) preserve issue code X_BAD_OUTPUT while including safe field paths and error types in the message sent to Attempt 2 (e.g. "Schema validation failed: models_text: string_too_long"); (3) add offline reproduction tests verifying safe logging and successful two-call recovery.
Alternatives considered:
1. Reusing X_TOO_LONG: Rejected to preserve the semantic boundary that verify.py issue codes represent semantic and length checks on parsed drafts, while X_BAD_OUTPUT represents schema/format parse failures.
2. Increasing schema limits without diagnostics: Rejected because the root cause was an unproven hypothesis and prompt limits must be respected.
If we removed it: Developers and LLM repair loops would remain blind to which specific schema fields triggered X_BAD_OUTPUT.
Decided by: agent proposed, user approved
Status: active

### D-200 — Stage E1 — deviation
What: Introduce evaluation suite cases, pure metrics aggregation in evals/metrics.py, side-by-side comparison in evals/compare.py, and dedicated test runner in evals/tests.
Why: To systematically measure LLM prompt performance across multiple repeated runs rather than relying on single manual invocations, Stage E1 introduces the evaluation dataset in evals/cases/ and evaluation tools. evals/metrics.py is introduced as a pure calculation module containing run dataclasses and aggregation statistics (attempt-1 pass rate, final pass rate, fallback rate, code repair rate, average node counts, lint and error counts) with zero database, LLM, or app-layer imports. As a deviation approved by the user, tests live in evals/tests/test_evals.py rather than apps/api/tests/, preserving apps/api/pyproject.toml and its type-checker scope unchanged. scripts/check.ps1 receives one added step to run pytest on evals/tests from the apps/api virtual environment.
Alternatives considered:
1. Placing test_evals.py in apps/api/tests/: Rejected because it would require altering apps/api/pyproject.toml (adding repo-root to pythonpath and mypy_path), coupling the core API type-check scope to root developer tooling.
2. Inlining metric calculations into evals/compare.py: Rejected because separating pure aggregation into evals/metrics.py allows clean unit testing without CLI argument parsing or presentation overhead.
If we removed it: Prompt performance changes would remain anecdotal and could not be regression-tested deterministically across runs.
Decided by: agent proposed, user approved
Status: active

### D-197 — Stage B6b — decision
What: Introduce architect prompt v5, repair v5, and patterns v5 to keep merge nodes as plain code and size small needs proportionally.
Why: Live Gemini outputs revealed two issues: (1) join/aggregator nodes combining parallel fan-outs were unnecessarily marked with ai_role="agent" and needs_model=True (which also violated new lint W_MERGE_AS_AGENT); and (2) vague or small needs produced over-engineered designs with 7+ nodes, speculative fan-outs, and extra caching/agent layers because the prompt lacked concrete sizing guidance for simple needs while mentioning "aggregator agents" and "7 to 15 components". In B6b: (1) architect_v5.md instructs the model that merge/join/aggregator nodes are plain code (ai_role "none", needs_model false) unless the user request explicitly requires AI judgment at the join; (2) removes "aggregator agents" from illustrative layering; (3) establishes that vague or small needs usually yield 3 to 6 components without speculative fan-outs or agents, keeping assumptions in the brief; (4) removes "7 to 15 components" to avoid artificial inflation on complex needs; (5) architect_repair_v5.md instructs not to convert merges into models/agents during repair; (6) patterns_v5/parallel_fan_out_merge.md sets aggregator ai_role "none" and needs_model false and removes the dispatcher -> audit store edge; and (7) architect service updates its defaults and labels to architect_v5 and patterns v5.
Alternatives considered:
1. Adding a hard validation rule rejecting merge nodes as agents: Rejected because some legitimate designs require synthesis models at join points, so a prompt-level instruction combined with non-blocking lint W_MERGE_AS_AGENT is the correct design.
2. Hardcoding component count limits: Rejected because architectural sizing should be guided by use case complexity rather than rigid node counts.
If we removed it: Join nodes would continue to be styled as AI agents, and simple user needs would continue to generate over-complex multi-branch topologies.
Decided by: agent proposed, user approved
Status: active

### D-200 — Stage E1 — deviation
What: Introduce evaluation suite cases, pure metrics aggregation in evals/metrics.py, side-by-side comparison in evals/compare.py, and dedicated test runner in evals/tests.
Why: To systematically measure LLM prompt performance across multiple repeated runs rather than relying on single manual invocations, Stage E1 introduces the evaluation dataset in evals/cases/ and evaluation tools. evals/metrics.py is introduced as a pure calculation module containing run dataclasses and aggregation statistics (attempt-1 pass rate, final pass rate, fallback rate, code repair rate, average node counts, lint and error counts) with zero database, LLM, or app-layer imports. As a deviation approved by the user, tests live in evals/tests/test_evals.py rather than apps/api/tests/, preserving apps/api/pyproject.toml and its type-checker scope unchanged. scripts/check.ps1 receives one added step to run pytest on evals/tests from the apps/api virtual environment.
Alternatives considered:
1. Placing test_evals.py in apps/api/tests/: Rejected because it would require altering apps/api/pyproject.toml (adding repo-root to pythonpath and mypy_path), coupling the core API type-check scope to root developer tooling.
2. Inlining metric calculations into evals/compare.py: Rejected because separating pure aggregation into evals/metrics.py allows clean unit testing without CLI argument parsing or presentation overhead.
If we removed it: Prompt performance changes would remain anecdotal and could not be regression-tested deterministically across runs.
Decided by: agent proposed, user approved
Status: active

### D-198 — Stage B6d — decision
What: Code aligns explainer draft flow steps into topological flow_order when all nodes are present, and provides expected node ID sequences on verification failure.
Why: In multi-branch architectures (e.g. design f6c61fd5 with 3 parallel branches), multiple topological orderings are valid request flow narratives, but order_nodes deterministically selects a single permutation using Kahn's algorithm with min-heap alphabetical tie-breaking. Raw LLM draft order matching Python's heapq alphabetical tie-breaker is no longer required: before verification in explainer/service.py, if the set of draft flow_step node_ids equals the set of flow_order IDs and each ID appears exactly once, code sorts draft.flow_steps into flow_order, guaranteeing that final output order is still flow_order (code-sorted). If a draft omits or duplicates nodes, it is not sorted, verify_draft stays strict and reports X_FLOW_ORDER, and the retry message explicitly provides the expected node ID sequence.
Alternatives considered:
1. Loosening verify_draft to accept any topological sort: Rejected because verify_draft must remain a pure, strict validator against the canonical flow_order contract.
2. Forcing LLM to guess min-heap alphabetical tie-breaks via repeated retries: Rejected because it wastes LLM calls and forces fallback to code-only explanations when the prose is otherwise high quality.
If we removed it: Explanations for parallel branch architectures would repeatedly fail with X_FLOW_ORDER and fall back to the basic code-built template.
Decided by: agent proposed, user approved
Status: active

### D-200 — Stage E1 — deviation
What: Introduce evaluation suite cases, pure metrics aggregation in evals/metrics.py, side-by-side comparison in evals/compare.py, and dedicated test runner in evals/tests.
Why: To systematically measure LLM prompt performance across multiple repeated runs rather than relying on single manual invocations, Stage E1 introduces the evaluation dataset in evals/cases/ and evaluation tools. evals/metrics.py is introduced as a pure calculation module containing run dataclasses and aggregation statistics (attempt-1 pass rate, final pass rate, fallback rate, code repair rate, average node counts, lint and error counts) with zero database, LLM, or app-layer imports. As a deviation approved by the user, tests live in evals/tests/test_evals.py rather than apps/api/tests/, preserving apps/api/pyproject.toml and its type-checker scope unchanged. scripts/check.ps1 receives one added step to run pytest on evals/tests from the apps/api virtual environment.
Alternatives considered:
1. Placing test_evals.py in apps/api/tests/: Rejected because it would require altering apps/api/pyproject.toml (adding repo-root to pythonpath and mypy_path), coupling the core API type-check scope to root developer tooling.
2. Inlining metric calculations into evals/compare.py: Rejected because separating pure aggregation into evals/metrics.py allows clean unit testing without CLI argument parsing or presentation overhead.
If we removed it: Prompt performance changes would remain anecdotal and could not be regression-tested deterministically across runs.
Decided by: agent proposed, user approved
Status: active

### D-199 — Stage B6e — deviation
What: Introduce writer_v2.md prompt explicitly enumerating character limits, forbidden cost/effort words, compliance phrases, and standalone step requirements.
Why: In two real Gemini 3.5 Flash explanation runs on 12-node designs, Attempt 1 repeatedly failed on forbidden words (e.g. cost, savings), compliance claims (e.g. fully secure), and models_text length limits (410 > 400 chars) because writer_v1.md lacked upfront negative constraints. Although BUILD_PLAN.md:483 states "Do not: ... add effort or cost words to the prompt", listing them as explicit negative prohibitions ("Never use any of the following forbidden words: cost, costs, price...") is necessary so the model avoids them on Attempt 1 rather than having only a single retry to discover them. Precedent exists in architect_v5.md:56 ("Never mention or invent cost, price, effort, or timeline figures anywhere"). In B6e: (1) writer_v2.md explicitly lists the 9 forbidden words, 6 compliance phrases, strict field limits with guidance to aim under 350 chars for models_text, the requirement to reference only numbers under "Known Numbers from Brief", and standalone step text; (2) explainer/service.py defines EXPLAINER_PROMPT_NAME = "writer_v2" and adds explainer_prompt to structured logs.
Alternatives considered:
1. Keeping writer_v1.md and relying on retry feedback: Rejected because real runs show that discovering multiple failure classes on Attempt 1 leaves zero margin of error on Attempt 2, frequently triggering fallback.
2. Increasing schema character limits: Rejected because prompt-level conciseness guidance is the correct architectural boundary and keeps explanations digestible.
If we removed it: Explainer runs would continue to fail on Attempt 1 due to untracked forbidden words and compliance claims, risking fallback.
Decided by: agent proposed, user approved
Status: active

### D-200 — Stage E1 — deviation
What: Introduce evaluation suite cases, pure metrics aggregation in evals/metrics.py, side-by-side comparison in evals/compare.py, and dedicated test runner in evals/tests.
Why: To systematically measure LLM prompt performance across multiple repeated runs rather than relying on single manual invocations, Stage E1 introduces the evaluation dataset in evals/cases/ and evaluation tools. evals/metrics.py is introduced as a pure calculation module containing run dataclasses and aggregation statistics (attempt-1 pass rate, final pass rate, fallback rate, code repair rate, average node counts, lint and error counts) with zero database, LLM, or app-layer imports. As a deviation approved by the user, tests live in evals/tests/test_evals.py rather than apps/api/tests/, preserving apps/api/pyproject.toml and its type-checker scope unchanged. scripts/check.ps1 receives one added step to run pytest on evals/tests from the apps/api virtual environment.
Alternatives considered:
1. Placing test_evals.py in apps/api/tests/: Rejected because it would require altering apps/api/pyproject.toml (adding repo-root to pythonpath and mypy_path), coupling the core API type-check scope to root developer tooling.
2. Inlining metric calculations into evals/compare.py: Rejected because separating pure aggregation into evals/metrics.py allows clean unit testing without CLI argument parsing or presentation overhead.
If we removed it: Prompt performance changes would remain anecdotal and could not be regression-tested deterministically across runs.
Decided by: agent proposed, user approved
Status: active







### D-200 — Stage E1 — deviation
What: Introduce evaluation suite cases, pure metrics aggregation in evals/metrics.py, side-by-side comparison in evals/compare.py, and dedicated test runner in evals/tests.
Why: To systematically measure LLM prompt performance across multiple repeated runs rather than relying on single manual invocations, Stage E1 introduces the evaluation dataset in evals/cases/ and evaluation tools. evals/metrics.py is introduced as a pure calculation module containing run dataclasses and aggregation statistics (attempt-1 pass rate, final pass rate, fallback rate, code repair rate, average node counts, lint and error counts) with zero database, LLM, or app-layer imports. As a deviation approved by the user, tests live in evals/tests/test_evals.py rather than apps/api/tests/, preserving apps/api/pyproject.toml and its type-checker scope unchanged. scripts/check.ps1 receives one added step to run pytest on evals/tests from the apps/api virtual environment.
Alternatives considered:
1. Placing test_evals.py in apps/api/tests/: Rejected because it would require altering apps/api/pyproject.toml (adding repo-root to pythonpath and mypy_path), coupling the core API type-check scope to root developer tooling.
2. Inlining metric calculations into evals/compare.py: Rejected because separating pure aggregation into evals/metrics.py allows clean unit testing without CLI argument parsing or presentation overhead.
If we removed it: Prompt performance changes would remain anecdotal and could not be regression-tested deterministically across runs.
Decided by: agent proposed, user approved
Status: active


### D-201 — Stage E2 — decision
What: Implement in-process evaluation runner in evals/run.py with isolated temporary SQLite database, dry-run mode, and quota-abort protection.
Why: Evaluating architecture synthesis and walkthrough generation requires executing the full intake, design synthesis, and explanation pipeline repeatedly across test needs while strictly protecting the developer's development database (arch_nemesis.db) and API quota. evals/run.py executes services in-process, initializing an isolated temporary database in Python's tempfile directory with Base.metadata.create_all that is cleaned up on exit. A wrapper class around LLMClient deterministically measures call counts without application modifications, while an in-memory structlog event collector captures verification issue codes (X_ codes) and repair events. A --dry flag exercises the pipeline with FakeLLMClient for zero-quota structural verification, and unrecoverable quota errors (429/503) trigger immediate execution abort with partial result persistence to evals/results/.
Alternatives considered:
1. Running evaluations via HTTP against a running server: Rejected because it requires external background server management and loses structured verification diagnostics exposed in backend exceptions.
2. Sharing arch_nemesis.db with a test session prefix: Rejected because test runs would pollute the primary local development database with synthetic sessions and designs.
If we removed it: Prompts could not be statistically benchmarked across repeated runs without risking local database pollution or wasting quota on rate-limited failures.
Decided by: agent proposed, user approved
Status: active


### D-202 — Stage E2 — fix
What: Capture evaluation structured logs using a direct structlog processor rather than standard library logging handler, and record per-attempt verification issue codes in CaseRunRecord.
Why: In evaluation benchmarks, run.py failed to record explainer verification failure codes (such as X_COMPLIANCE_CLAIM) in by_case.issue_counts because setup_logging() was not called by the standalone runner, causing structlog to use its default ConsoleRenderer directly to stdout instead of emitting JSON via standard library logging. Replacing the standard library handler with an in-memory structlog processor (StructlogEventCollector) intercepts event dictionaries before rendering, making issue capture completely independent of render formatting. CaseRunRecord is expanded with explainer_attempt_1_issues, explainer_attempt_2_issues, code_repair_events, and design_attempt_issues to provide granular diagnostic visibility.
Alternatives considered:
1. Calling setup_logging() in run.py: Rejected because it forces JSON logging on the console, removing human-readable key=value output for interactive terminal runs.
2. Parsing regex on console text: Rejected because it is fragile to formatting changes and cannot reliably deserialize nested issue code lists.
If we removed it: Evaluation reports would show empty issue_counts even when verification retries were triggered, obscuring prompt failures.
Decided by: agent proposed, user approved
Status: active


### D-203 — Stage E3 — decision
What: Evaluation runner pacing, 429 retry protection, fallback rate calculation fix, and design issue aggregation.
Why: The baseline evaluation benchmark aborted after 28 runs due to Gemini's 15 requests/minute quota limit. We add `--pause-seconds` (defaulting to 8.0s derived from worst-case 7-call runs) to sleep strictly between runs, and implement single-retry handling on `LLMRateLimited` by parsing the retry delay from error text (with 1s safety margin, defaulting to 60s) before aborting. We fix an evaluation bug where 422 design failures initialized `explainer_source="fallback"`, which incorrectly equated fallback rate to 422 failure rate despite the explainer never executing; 422 runs now set `explainer_source="none"` and fallback rate is computed strictly over runs where the explainer ran. We capture `design_attempt_issues` across both 422 failures and retried designs, aggregating `design_issue_counts` in per-case and overall summaries, and update `compare.py` to display them safely with `.get("design_issue_counts", {})` so older result files continue loading.
Alternatives considered:
1. Hardcoded 60s sleep without parsing retry-after: Rejected because Gemini often requires only 12-25s to replenish window tokens, so parsing reduces benchmark latency while 60s remains a safe fallback.
2. Including 422 failures in fallback rate denominator: Rejected because fallback specifically measures the explainer's inability to satisfy verification, whereas 422 occurs earlier in architecture synthesis.
If we removed it: Benchmark evaluation runs would repeatedly abort on rate limits, explainer fallback statistics would remain distorted by 422s, and design-side validation failures would remain invisible in metric summaries.
Decided by: agent proposed, user approved
Status: active


### D-204 — Stage 422a — decision
What: Fix code repair node ID logging and sanitize covers references against brief constraints.
Why: In service.py:130 and service.py:198, the logging of node_ids during code repair mistakenly pulled w.ids[0], which is the constraint ID (e.g. 'c1') rather than the repaired node IDs in w.ids[1:]. Furthermore, baseline evaluation revealed that models occasionally populate ConstraintSpec.covers with assumption sentences or hallucinated IDs when no brief constraints exist, triggering E_CONSTRAINT_BAD_PARAM. Under Extension 2a, repair.py sanitizes covers by stripping entries not present in brief_constraints and reporting each sanitization as W_CODE_REPAIR_APPLIED. Pure validation in validate.py remains untouched. If a real brief constraint is left uncovered, E_BRIEF_CONSTRAINT_UNCOVERED still fires deterministically in check_coverage.
Alternatives considered:
1. Mutating covers in validate.py or parse_and_validate: Rejected because validation must remain a pure, read-only verification of the specification.
2. Introducing a new warning code W_COVERS_SANITIZED: Rejected to avoid altering the closed set of warning codes in docs/contracts.md.
If we removed it: Code repair logs would continue attributing graph modifications to constraint IDs instead of node IDs, and specs with assumption text in covers would needlessly fail with 422 instead of being cleanly repaired.
Decided by: agent proposed, user approved
Status: active


### D-205 — Stage 422b — decision
What: Introduce architect prompt v6 and architect repair prompt v6 with precise constraint semantics and branch ordering.
Why: Baseline evaluation revealed a 21% 422 failure rate caused primarily by the LLM choosing must_pass_through for conditional requirements (such as human review on high-risk branches while automated branches bypass it) and placing must_pass_through on exit or audit sinks. Additionally, covers was sometimes populated with plain-text assumption sentences instead of brief constraint IDs. Stage 422b creates architect_v6.md and architect_repair_v6.md leaving previous prompt versions untouched. The new prompts clarify constraint selection (must_precede for branch-specific ordering, must_pass_through strictly for universal bottlenecks, must_exist for presence without ordering, must_not_connect graph verification before edge creation, and covers: [] when brief constraints are absent). In architect_repair_v6.md, models are instructed that when a bypass path is detected for a conditional requirement, they should change the constraint kind to must_precede or must_exist while preserving the rule ID and its covers.
Alternatives considered:
1. Editing architect_v5.md in place: Rejected because GEMINI.md and BUILD_PLAN.md require prompt version preservation so prior evaluations remain reproducible.
2. Relying entirely on automated code repair: Rejected because code cannot invent semantic intent or re-route conditional business branches without LLM guidance.
If we removed it: Models would continue misclassifying branch-specific checkpoints as universal bottlenecks, causing repeated 422 validation failures on realistic multi-branch workflows.
Decided by: agent proposed, user approved
Status: active


### D-206 — Stage 422c — decision
What: Store per-attempt validator diagnostics and real code repair events in evaluation results.
Why: Previously, evaluation result records discarded intermediate design attempt details, hardcoded code_repair_used=False on 422 design failures, and stored only a flat list of error codes. Stage 422c enhances evals/run.py and evals/metrics.py to capture per-attempt records (attempt index, issue codes, constraint kinds, and sanitized validator issue messages truncated to 300 characters, max 5) across all runs. In service.py, the design_attempt log event now includes constraint_kinds (a list of kind strings only) while preserving logging redaction rules (no user text, prompts, or LLM responses). On 422 design failures, real code_repair events collected during synthesis are recorded in the run record. Existing fields are preserved with default factories so compare.py maintains complete backward compatibility with earlier evaluation result files.
Alternatives considered:
1. Logging full validator issue messages in service.py: Rejected because validator messages for E_CONSTRAINT_VIOLATED embed brief constraint text, which can contain sensitive user input or sentinels, violating production logging redaction rules.
2. Only recording per-attempt diagnostics on 422 failures: Rejected because multi-attempt successful runs also benefit from visibility into what issues were caught and repaired on attempt 1.
If we removed it: Evaluation results would lack visibility into multi-attempt failure causes, 422 design failures would falsely appear as never using code repair, and diagnostics would remain limited to the final attempt's error strings.
Decided by: agent proposed, user approved
Status: active


### D-207 — Stage 422d — decision
What: Introduce architect prompt v7 and architect repair prompt v7 with branch-specific precedence and sanitizer constraints.
Why: Diagnostic inspection of v6 evaluation runs revealed remaining 422 failures caused by: (1) must_precede targeting shared downstream merge/exit nodes reached by alternative branches (e.g. finance 2: auto_release bypassing human review to reach delivery_dispatcher); (2) dual must_precede targeting the same aggregator across parallel branches (legal 5); (3) must_not_connect inappropriately applied to sanitized audit/log sinks where sanitized data legitimately flows (legal 3). Stage 422d introduces architect_v7.md and architect_repair_v7.md leaving v1-v6 untouched. The prompts clarify: must_precede is valid only when every path to node B passes node A; merge/aggregator/exit nodes reached by alternative branches must never be targeted with must_precede; sanitized audit sinks must use must_precede(sanitizer, sink) or must_exist instead of must_not_connect; repair of bypasses representing legitimate workflows must retarget or downgrade to must_exist while preserving rule IDs and covers; true system-wide bottlenecks (e.g. ingress guardrail, scoring) must remain must_pass_through; and a strict coverage guard forbids defaulting to weak must_exist everywhere.
Alternatives considered:
1. Editing architect_v6.md in place: Rejected to ensure prompt version immutability and reproducibility of historical benchmarks.
2. Adding automatic graph rerouting to code repair: Rejected because code cannot infer domain intent or decide whether an alternative branch should legitimately bypass a human checkpoint.
If we removed it: Architect models would continue producing unprovable precedence constraints on multi-branch workflows and invalid isolation constraints on sanitized audit sinks, keeping the 422 rate elevated.
Decided by: agent proposed, user approved
Status: active




### D-208 — Stage 422e — decision
What: Refine expected_constraints_rate calculation and store final constraint summaries in evaluation results.
Why: Inspection of evaluation results revealed that runs terminating in 422 design failures defaulted to expected_constraints_satisfied=True because no final specification existed, artificially inflating expected_constraints_rate when 422s occurred and distorting comparisons as 422 rates dropped. Stage 422e updates CaseRunRecord with expected_constraints_applicable (bool, default True for backward compatibility, set to False on 422 runs). In metrics.py, expected_constraints_rate is computed as satisfied / applicable runs (or 0.0 if applicable is 0), ensuring 422 runs do not count as satisfied. Additionally, CaseRunRecord now records final_constraints (a list of compact dictionaries containing id, kind, node_id, a, b, and covers only—strictly excluding user brief text, prompts, and responses). A standalone utility evals/recompute_metrics.py allows evaluating historical result files (v5, v6, v7) under the honest applicable-denominator metric without modifying raw result files on disk.
Alternatives considered:
1. Setting expected_constraints_satisfied=False on 422 runs: Rejected because a run that failed to synthesize a valid architecture cannot meaningfully be judged on whether its constraints matched expectations; dividing by applicable runs correctly decouples validity failure from constraint selection.
2. Storing full constraint text in final_constraints: Rejected to maintain strict data minimization and prevent user brief text or prompt injection text from leaking into benchmark artifacts.
If we removed it: Evaluation reports would continue overstating constraint coverage on runs with high 422 rates, and engineers would lack structural target visibility into final generated constraints.
Decided by: agent proposed, user approved
Status: active




### D-209 — Stage 422f — decision
What: Introduce architect prompt v8 and architect repair prompt v8 with universal bottleneck reinforcement and exit sink incoming edge check.
Why: Inspection of v7 evaluation runs revealed that while overall 422 rates dropped to 6.7%, models almost completely stopped choosing must_pass_through for universal bottlenecks (dropping the honest expected_constraints_rate to 0.20 in finance and 0.00 in legal). This occurred because v7 prominently featured prohibitions against must_pass_through to avoid conditional bypasses. Stage 422f introduces architect_v8.md and architect_repair_v8.md, preserving all previous versions untouched. The v8 prompts introduce an actionable positive plain-words test ('Does EVERY request/transaction entering the system cross this node before reaching ANY final outcome or exit?'), explicit guidance to synthesize a separate must_pass_through constraint for universal preprocessing stages (such as fraud scoring or clause extraction), an explicit check that no exit sink has an incoming edge from a node preceding X, and concrete repair guidance distinguishing graph rerouting for true bottlenecks from constraint downgrades for legitimate conditional bypasses.
Alternatives considered:
1. Reverting to v5 prompt text: Rejected because v5 suffered from a 21% 422 failure rate due to models misapplying must_pass_through to conditional checkpoints and exit sinks.
2. Altering validation semantics in constraints.py to ignore auxiliary exit sinks: Rejected because validation purity rules require verification against all exit nodes defined in the specification.
If we removed it: Models would continue avoiding must_pass_through for universal processing stages, permanently depressing the expected_constraints_rate on multi-branch workflows.
Decided by: agent proposed, user approved
Status: active




### D-210 — Phase 7A — Pure patch logic and refinement schema constraints separation
What: Adopt refine_G flat `changes` Op model for Patch validation, and enforce patch and field limits in application code rather than LLM schema annotations.
Why: Live Gemini schema probing in Phase 7 Step 0 established that schema-level constraint annotations (`max_length`, `min_length`, `maxItems`, `pattern`) on nested or optional Op fields triggered 400 INVALID_ARGUMENT errors from the Gemini API. Removing these annotations while preserving the discrete fields (variant refine_G: single flat `changes` model + nested models) was proven accepted by Gemini. Consequently, LLM-facing patch models (`Op`, `Changes`, `Patch`) define unconstrained types, while all operational limits (`P_EMPTY_PATCH`, `P_TOO_MANY_OPS`, field lengths, node ID patterns) are strictly checked in Python code post-parsing and via `validate()` on the mutated specification deep copy.
Alternatives considered:
1. Serializing patch arguments into an opaque stringified `payload_json: str`: Rejected because refine_G succeeded, preserving structured validation and autocompletion without client/server JSON string parsing overhead.
2. Placing field length validations in the LLM-facing Pydantic model: Rejected because Gemini's schema parser rejects OpenAPI schemas with heavy combinations of min/max length and array constraints on optional object fields.
If we removed it: Schema validation with Gemini for refinement and suggestion calls would fail with 400 INVALID_ARGUMENT, blocking conversational architecture editing.
Decided by: agent proposed, user approved
Status: active



### D-211 — Phase 7B — Migration 0004 chat_messages and patches schema
What: Create migration 0004 adding `chat_messages` and `patches` tables.
Why: Refinement chat requires persisting conversational history and candidate graph patches across turns. `chat_messages` stores message history (`id`, `design_id`, `role`, `text`, `created_at`) scoped to designs. `patches` records patches (`id`, `design_id`, `kind`, `base_version`, `status`, `patch_json`, `diff_json`, `issues_json`, `reason`, `created_at`, `decided_at`) enabling review, acceptance, rejection, and deterministic diff tracking.
Alternatives considered:
1. Embedding chat messages and patches directly in `design_versions.spec_json`: Rejected because patches and messages exist prior to and independent of design version promotion; embedding would mutate immutable version snapshots.
If we removed it: Refinement dialogue history and pending patch proposals would be lost across HTTP requests.
Decided by: agent proposed, user approved
Status: active

### D-212 — Phase 7B — Refinement patch status lifecycle
What: Enforce explicit patch statuses (`proposed`, `blocked`, `needs_confirmation`, `accepted`, `rejected`, `superseded`).
Why: Separating validity and user intent states prevents applying invalid designs or unverified requirement drops. `proposed` represents valid patches; `blocked` denotes structural/rule violations; `needs_confirmation` indicates brief constraints were dropped; `accepted` and `rejected` track explicit user decisions; `superseded` invalidates rival proposals once a version is promoted.
Alternatives considered:
1. Boolean `is_valid` flag: Rejected because `needs_confirmation` requires explicit user acknowledgment, which a boolean cannot express.
If we removed it: Patches removing brief requirements could be accepted without explicit user acknowledgment, or stale rival proposals could be accepted concurrently.
Decided by: agent proposed, user approved
Status: active

### D-213 — Phase 7B — Atomic accept transaction with UNIQUE(design_id, version_no) protection
What: Execute patch accept and version n+1 promotion in a single short database transaction relying on `UNIQUE(design_id, version_no)`.
Why: LLM generation is never held within an open database transaction. When accepting a patch, the server verifies `base_version == design.current_version`, re-validates the patch against current spec, inserts version `n+1`, updates `design.current_version = n+1`, marks competing proposals superseded, and commits. The composite unique constraint prevents concurrent duplicate version creation.
Alternatives considered:
1. Pessimistic table locking during patch evaluation: Rejected because re-validation is CPU-bound pure code; short optimistic atomic transactions avoid lock contention.
If we removed it: Concurrent accept requests could create duplicate versions or corrupt version progression.
Decided by: agent proposed, user approved
Status: active

### D-214 — Phase 7B — Server-derived dropped_brief_ids from stored patch
What: Server derives `dropped_brief_ids` directly by evaluating the stored patch and `confirm_drop` boolean, never accepting client-supplied ID lists.
Why: Client-supplied lists of dropped requirement IDs could be spoofed to silently suppress arbitrary brief requirements. By re-running `apply_patch` on the stored patch, the server verifies which brief constraints are actually uncovered by rule removals and only drops those when `confirm_drop=True`.
Alternatives considered:
1. Trusting client-sent `dropped_brief_ids`: Rejected as an untrusted input security and contract violation.
If we removed it: Malicious or buggy clients could strip brief requirements from designs without corresponding patch rule changes.
Decided by: agent proposed, user approved
Status: active

### D-215 — Phase 7B — Byte-for-byte spec preservation on version restore
What: Copy `spec_json` byte-for-byte when creating a restored version, creating a new version with change note `Restored from v{k}`.
Why: Restoring a historical architecture version must produce an exact replica of the target version's JSON structure without deserialization/re-serialization drift or re-ordering. It increments `current_version` to `n+1`, preserves version immutability, and forbids restoring the current version (409).
Alternatives considered:
1. Re-pointing `current_version` back to the old version number: Rejected because design versions are strictly immutable and historical version logs must remain append-only.
If we removed it: Version history would be rewritten and restored specs could suffer JSON normalization drift.
Decided by: agent proposed, user approved
Status: active

### D-216 — Phase 7B — Refinement turn and version caps enforcement
What: Enforce `MAX_REFINEMENT_TURNS` (409 CAP_TURNS) and `MAX_VERSIONS` (409 CAP_VERSIONS) with strict error envelopes and contract messages.
Why: Pre-sales qualification requires bounding compute and API expenditure per design. Once `MAX_REFINEMENT_TURNS` user messages/suggestions or `MAX_VERSIONS` versions are reached, the API returns HTTP 409 with user-guiding contact messages.
Alternatives considered:
1. Silently truncating history or returning empty patches: Rejected because users must be clearly informed when qualification limits are reached.
If we removed it: Unbounded refinement loops would consume excessive LLM quota.
Decided by: agent proposed, user approved
Status: active

### D-217 — Phase 7B — Import-linter contract update for refinement module
What: Add `archnemesis.modules.refinement` to the independent sibling modules contract in `pyproject.toml`.
Why: The refinement module handles refinement HTTP endpoints, persistence, and service logic. Adding it to the sibling contract ensures that `designs` may import it, but sibling modules (`intake`, `architect`, `explainer`, `leads`, `refinement`) cannot import each other, keeping domain boundaries strictly decoupled.
Alternatives considered:
1. Merging refinement into `designs`: Rejected because refinement represents a distinct conversational sub-domain with its own messages, patches, and suggestions.
If we removed it: Architecture layer boundaries would not be enforced by `lint-imports`.
Decided by: agent proposed, user approved
Status: active

### D-218 — Phase 7B — Refinement turn and version cap HTTP status codes (409)
What: Affirm HTTP 409 status code for both `CapTurnsError` (`CAP_TURNS`) and `CapVersionsError` (`CAP_VERSIONS`).
Why: `docs/BUILD_PLAN.md:545` specifies HTTP 409 for both CAP_TURNS and CAP_VERSIONS. Exceeding qualification turn or version caps represents an unresolvable state conflict on the immutable design resource, requiring user contact rather than client request retry. This entry supersedes any conversational reference to HTTP 429 and confirms HTTP 409 in `errors.py`, `docs/contracts.md`, and test suites.
Alternatives considered:
1. HTTP 429 Too Many Requests: Rejected because 429 indicates transient time-window rate limiting (retry after delay), whereas turn and version caps are terminal per-design lifecycle limits.
If we removed it: API clients could confuse design lifecycle exhaustion with transient network/rate throttling.
Decided by: user instructed (BUILD_PLAN.md:545)
Status: active

### D-219 — Phase 7B — Serializing warnings_json in DesignVersionTable as list[str]
What: In rchnemesis.modules.refinement.service, serialize warnings_payload as list[str] (extracting i.message from warning issues) rather than list[dict] before storing in DesignVersionTable.warnings_json.
Why: docs/contracts.md:88, designs/schemas.py:27, and 
efinement/schemas.py:142 define warnings on design responses as list[str]. When ccept_patch serialized dictionaries into warnings_json, deserialization inside _format_design_response passed list[dict] to RefinedDesignResponse(warnings=...), raising a Pydantic ValidationError that surfaced as HTTP 500 INTERNAL_ERROR. Aligning warnings_payload with [w.message for w in val_res.warnings] from designs/service.py:80 ensures type safety and contract compliance.
Alternatives considered:
1. Expanding warnings schema to list[Issue | str]: Rejected because docs/contracts.md:88 freezes warnings: list[str] across all design responses.
If we removed it: Pydantic validation failure would block POST /api/designs/{id}/patches/{id}/accept from returning new design versions when non-fatal validation warnings exist.
Decided by: agent proposed, bug fix
Status: active



## Phase 3 Summary

Phase 3 delivered the end-to-end intake dialogue and architecture generator engine:
1. **Live Gemini Schema Verification (`scripts/schema_probe.py`):** Verified live Gemini compatibility for both `ArchitectureSpec` and `IntakeLLMOutput`.
2. **Pure Shared Domain Layer (`archnemesis.shared`):** Defined `RequirementBrief`, `BriefConstraint`, and `BriefNumber` models, verified with AST whitelist testing and import-linter purity contracts.
3. **Intake Discovery Dialogue (`archnemesis.modules.intake`):** Implemented multi-turn dialogue with `POST /api/intake/turn`, enforcing input length limits, 1-retry on malformed replies, round cap of 3 with forced brief synthesis, code-assigned constraint IDs (`bc1`, `bc2`), and `SESSION_CLOSED` (409) protection.
4. **Architecture Generation & Automated Repair (`archnemesis.modules.architect`):** Implemented generator loop capped at 3 total LLM calls with `<untrusted_user_text>` prompt injection defense, multi-stage validation checking, and fallback to `DesignFailedError` (422 with issues).
5. **Design Persistence & Retrieval (`archnemesis.modules.designs`):** Implemented `POST /api/designs` and `GET /api/designs/{id}` using dual-table design and version persistence with concurrency race protection on `UNIQUE(intake_session_id)` and topological `flow_order` computation.
6. **Frontend Verification Harness:** Embedded test UI in Next.js home page for testing intake dialogue turns and architecture synthesis with configured proxy timeouts.

## Phase 1 Summary

Phase 1 established the end-to-end technical foundation for Arch-Nemesis:
1. **Backend Foundation (`apps/api`):** Configured Python 3.12 package using `uv`, FastAPI, async SQLAlchemy with SQLite, Alembic baseline migration, Pydantic settings with secret masking, structured logging with sensitive key redaction, unified error envelopes, and an abstract LLM interface (`FakeLLMClient` and `GeminiClient` with exponential backoff and jitter). Built GET `/api/health` returning DB connectivity and LLM configuration status.
2. **Frontend Foundation (`apps/web`):** Initialized Next.js 16 (App Router), React 19, Tailwind CSS v4, and classic shadcn/ui configured with Radix UI base and neutral OKLCH palette. Built client-side TanStack Query provider, `System Health` card querying `/api/health` with clean error state exclusivity, and comprehensive unit tests with Vitest and Testing Library.
3. **Operational Tooling (`scripts/`):** Implemented `dev.ps1` for local multi-service launch, `check.ps1` for unified static analysis and testing across both apps, and `llm_smoke.py` for safe manual live LLM verification.
4. **Validation:** 39 backend tests passed, 3 frontend tests passed, Ruff check/format clean, Mypy strict mode clean across all source files, import-linter architectural contracts verified.
