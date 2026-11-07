# Arch-Nemesis

Arch-Nemesis is a web application where users describe a business need in plain words (any domain) and receive an interactive architecture diagram and a plain-language explanation.
It serves as a pre-sales engineering tool that saves qualified client leads for manual proof-of-concept preparation without inventing timeline or cost figures.
Deterministic code validates the architecture design against strict graph constraints, while large language models propose the structure and draft the explanation.

---

## Prerequisites

- **Python**: 3.12 or newer
- **uv**: Fast Python package manager ([installation instructions](https://docs.astral.sh/uv/))
- **Node.js**: Node.js LTS (v20+ or v22+)
- **npm**: Node package manager bundled with Node.js
- **PowerShell**: For running developer automation scripts (`scripts/dev.ps1`, `scripts/check.ps1`)

---

## Clean-Clone Setup Guide

Follow these steps in exact order when setting up a fresh clone of the repository:

### 1. Install Backend Dependencies
```powershell
cd apps\api
uv sync
```

### 2. Install Frontend Dependencies
```powershell
cd ..\web
npm install
```

### 3. Configure Backend Environment
Copy the example environment template to create your local `.env`:
```powershell
cd ..\api
copy .env.example .env
```
Open `apps/api/.env` and configure the following variables:
- `GEMINI_API_KEY`: Your Google Gemini API key.
- `LLM_MODEL_INTAKE`: Gemini model ID for intake discovery (e.g. `gemini-2.5-flash`).
- `LLM_MODEL_ARCHITECT`: Gemini model ID for architecture generation (e.g. `gemini-2.5-pro`).
- `LLM_MODEL_WRITER`: Gemini model ID for explanation and refinement tasks (e.g. `gemini-2.5-flash`).
- `ADMIN_TOKEN` *(optional)*: Bearer token for accessing protected `/api/leads` admin endpoints.

### 4. Run Database Migrations
Apply the database schema up to the latest migration head:
```powershell
cd apps\api
uv run alembic upgrade head
```
> **Note:** Run `uv run alembic upgrade head` whenever pulling changes that introduce new database migrations.

---

## Running the Application

### Option A: Automated Dual-Process Launch (Recommended)
From the repository root, execute the launch script in PowerShell:
```powershell
powershell scripts\dev.ps1
```
This launches the FastAPI backend and Next.js frontend in separate terminal windows.

### Option B: Manual Process Launch
Open two separate terminal windows:

**Terminal 1 (Backend API):**
```powershell
cd apps\api
uv run uvicorn archnemesis.main:create_app --factory --reload --port 8000
```

**Terminal 2 (Frontend Web):**
```powershell
cd apps\web
npm run dev
```

Next.js automatically proxies `/api/*` requests to the FastAPI backend on port 8000. Access the web interface at `http://localhost:3000`.

---

## Verification & Tooling

### Run Full Test Suite & Linters
From the repository root, run the comprehensive verification script:
```powershell
powershell scripts\check.ps1
```
This executes:
- **Backend:** `ruff check`, `ruff format --check`, `mypy src tests`, `lint-imports` architectural contracts, and `pytest`.
- **Frontend:** ESLint, TypeScript typecheck (`tsc --noEmit`), and Vitest test suite.

---

## Evaluation Benchmark Suite

Arch-Nemesis includes an evaluation harness in `evals/` to benchmark LLM architecture generation quality, constraint satisfaction, code repair rates, and graph complexity across prompt and model revisions without spending production quota.

### Run Evaluations
```powershell
# Dry run with FakeLLMClient (zero API quota spent):
python evals/run.py --dry --runs 5

# Custom cases directory or specific files:
python evals/run.py --dry --cases evals/cases/finance.json,evals/cases/legal.json

# Live evaluation against configured Gemini models:
python evals/run.py --runs 5 --pause-seconds 8.0
```

### Compare Evaluation Runs
Compare two evaluation runs side by side to detect regressions or improvements:
```powershell
python evals/compare.py evals/results/baseline.json evals/results/candidate.json
```

---

## Known Limitations

1. **In-Memory Rate Limiting**: The sliding-window rate limiters for intake, design generation, refinement, and leads reside in application process memory. In-memory counters reset upon backend restart or across multiple horizontal workers.
2. **Reverse Proxy Client IP (`X-Forwarded-For`)**: Under Next.js rewrites, the proxy does not forward client `X-Forwarded-For` headers to the backend (`x_forwarded_for=None`), causing all browser requests to share a single `127.0.0.1` rate-limit bucket unless deployed behind an external reverse proxy (see `docs/DECISIONS.md:D-248`, superseding D-239/D-247).
3. **Spec Cache Organic Hit Rate**: The architecture specification cache (`spec_cache`) keys entries on canonical JSON of the `RequirementBrief`. Because requirement briefs are written in LLM-generated natural language, organic user hit rates are near 0%. The cache primarily optimizes evaluation benchmarks, repeated identical retries, and test runs (see `docs/DECISIONS.md:D-241`).
