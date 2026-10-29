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
