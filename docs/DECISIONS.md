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

### apps/web/
- `apps/web/.gitkeep`: Placeholder file ensuring git preserves the frontend Next.js application folder; Phase 0.

### scripts/
- `scripts/.gitkeep`: Placeholder file ensuring git preserves the operational scripts folder; Phase 0.

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

## Phase 1 Summary

Phase 1 established the end-to-end technical foundation for Arch-Nemesis:
1. **Backend Foundation (`apps/api`):** Configured Python 3.12 package using `uv`, FastAPI, async SQLAlchemy with SQLite, Alembic baseline migration, Pydantic settings with secret masking, structured logging with sensitive key redaction, unified error envelopes, and an abstract LLM interface (`FakeLLMClient` and `GeminiClient` with exponential backoff and jitter). Built GET `/api/health` returning DB connectivity and LLM configuration status.
2. **Frontend Foundation (`apps/web`):** Initialized Next.js 16 (App Router), React 19, Tailwind CSS v4, and classic shadcn/ui configured with Radix UI base and neutral OKLCH palette. Built client-side TanStack Query provider, `System Health` card querying `/api/health` with clean error state exclusivity, and comprehensive unit tests with Vitest and Testing Library.
3. **Operational Tooling (`scripts/`):** Implemented `dev.ps1` for local multi-service launch, `check.ps1` for unified static analysis and testing across both apps, and `llm_smoke.py` for safe manual live LLM verification.
4. **Validation:** 39 backend tests passed, 3 frontend tests passed, Ruff check/format clean, Mypy strict mode clean across all source files, import-linter architectural contracts verified.
