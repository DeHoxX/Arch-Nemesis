# Arch-Nemesis

Arch-Nemesis is a web application where users describe a business need in plain words and receive an interactive architecture diagram and plain-language explanation.
It serves as a pre-sales engineering tool that saves qualified client leads for manual proof-of-concept preparation without inventing timeline or cost figures.
Deterministic code validates the architecture design against strict graph constraints, while large language models propose the structure and draft the explanation.

## Prerequisites

- **Python**: 3.12 or newer (source: `docs/BUILD_PLAN.md` Section 4; installed on machine: Python 3.12.1)
- **uv**: Python package manager (version requirements: check the official docs at https://docs.astral.sh/uv/; installed on machine: uv 0.7.8)
- **Node.js**: Node.js LTS (check the Next.js installation page for the current minimum; installed on machine: Node.js v22.23.2)
- **npm**: Node package manager bundled with Node.js (check the official docs at https://docs.npmjs.com/)

## Running the Application (Target from Phase 1)

*Note: Application servers and dependencies will be configured in Phase 1. The commands below represent the target development workflow.*

Open two terminal windows:

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

Next.js automatically rewrites `/api/*` requests to the FastAPI backend on port 8000.
