# Data Contracts and System Limits

## 5. Data contracts

These are the load-bearing decisions. Changing them later means rewriting validation, prompts and the UI.

### RequirementBrief (module intake)

- `summary`, `users`, `data_involved` (list), `domain_hint` (free text).
- `stated_constraints`: list of `{id, text}`. Each is something the user said must hold (for example "answers must never expose personal data").
- `unverifiable_requirements`: list of text. Things the user wants that code cannot check. Shown to the user honestly as "not verified by checks".
- `numbers_given`: list of `{label, value, unit}`. The only numbers the explanation may repeat.
- `assumptions`: list of text (filled when the follow-up cap is hit).

### ArchitectureSpec (module validation, pure Pydantic)

- `nodes`: `{id, name, type, role, inputs[], outputs[], tech_options[] (optional), needs_model (bool), ai_role (none|model|agent), tools[]}`. `id` matches `^[a-z][a-z0-9_]{1,40}$`. `name` max 60, `type` max 40 (free text), `role` max 300, each input or output max 120, max 8 each, max 5 tech_options. `ai_role` is `"none"`, `"model"`, or `"agent"` (default `"none"`). `tools` has max 5 items, each max 60 characters. `needs_model` is synchronized: `model` or `agent` sets `needs_model=true`.
  - `inputs` and `outputs` are short free-text data/payload labels describing what a component consumes or emits (e.g. "user query", "order event"). They are NOT node IDs.
  - Diagram connectivity comes ONLY from `edges`.
  - Phase 4 detail panel must derive "Connected from / Sends to" from diagram `edges`, displaying `inputs`/`outputs` as data labels.
  - Phase 5 walkthrough may use `edges` for connected component names.
- `edges`: `{from, to, flows, condition (optional)}`. `flows` max 200. `condition` max 100 characters. No self-loops, no duplicate `(from, to)`.
- `constraints`: `{id, text, kind, node_id (optional), a (optional), b (optional), covers[]}`. `covers` lists the brief constraint ids this one satisfies.
- `entry_ids[]`, `exit_ids[]`.
- Limits (configurable constants): more than 25 nodes or 60 edges is an error (`E_NODE_LIMIT`, `E_EDGE_LIMIT`); fewer than 3 nodes is only a warning (`W_TOO_FEW_NODES`).
- v1 specs are acyclic (DAG). Feedback loops are described in a node's role, not drawn. Record as an ADR.

### Constraint kinds (closed set, nothing else is accepted)

| kind | params | passes when |
| --- | --- | --- |
| must_exist | node_id | the node exists |
| must_pass_through | node_id | removing the node leaves no path from any entry to any exit |
| must_not_connect | a, b | there is no path from a to b |
| must_precede | a, b | with a removed, b is unreachable from every entry |

A user requirement that fits no kind goes to `unverifiable_requirements`. It is never turned into a constraint that code cannot check.

### Validation error codes (blocking)
`E_SCHEMA`, `E_DUP_ID`, `E_BAD_REF`, `E_NO_ENTRY`, `E_NO_EXIT`, `E_ORPHAN`, `E_UNREACHABLE_FROM_ENTRY`, `E_CANNOT_REACH_EXIT`, `E_CYCLE`, `E_SELF_LOOP`, `E_DUP_EDGE`, `E_NODE_LIMIT`, `E_EDGE_LIMIT`, `E_UNKNOWN_CONSTRAINT_KIND`, `E_CONSTRAINT_BAD_PARAM`, `E_CONSTRAINT_VIOLATED`, `E_BRIEF_CONSTRAINT_UNCOVERED`.
Each error carries a code, a plain message and the ids involved.

### Lints (warnings, never block)
`W_MODEL_NODE_NO_INPUTS`, `W_NODE_NO_OUTPUTS`, `W_TOO_FEW_NODES`, `W_DUP_NODE_NAME`, `W_NO_AI_NODE`, `W_CODE_REPAIR_APPLIED`, `W_AGENT_WITHOUT_TOOLS`, `W_MERGE_AS_AGENT`.
Shown as "Notes".

### Stored per design version
`brief_json`, `spec_json`, `explanation_json`, `prompt_version`, model names used, `warnings`, `created_at`, `version_no`, `change_note`.
Versions are immutable. A lead points to an exact version.

### LLM error codes
`LLM_UNAVAILABLE` (503), `LLM_RATE_LIMITED` (429), `LLM_TIMEOUT`, `LLM_BAD_OUTPUT`.
Each maps to a friendly user message. Retry only on 503, 429 and timeout: up to 3 attempts with backoff. Schema failures are handled only by the repair loop.

---

## System Limits and Defaults

These live only in `settings.py` as environment-overridable settings, never as numbers inside other code:

| Setting | Default | Used for |
| --- | --- | --- |
| MAX_NODES | 25 | Largest allowed design |
| MAX_EDGES | 60 | Largest allowed design |
| MAX_INPUT_CHARS | 4000 | One user message in intake |
| MAX_FOLLOWUP_ROUNDS | 3 | Intake questions before it must proceed |
| MAX_REPAIR_ATTEMPTS | 2 | Generator repairs after the first try |
| LLM_MAX_ATTEMPTS | 3 | Tries per LLM call on 503, 429 or timeout |
| LLM_TIMEOUT_SECONDS | 60 | One LLM call, converted to the SDK's unit |
| LEAD_NOTE_MAX_CHARS | 500 | Optional note on the contact form |
| MAX_PATCH_OPS | 20 | Operations in one change proposal |
| MAX_REFINEMENT_TURNS | 20 | User messages per design |
| MAX_VERSIONS | 15 | Versions per design |

---

## Phase 3 Intake & Design Contracts

### Intake Round Definition and Lifecycle Trace

A round represents a discrete interaction cycle in the discovery dialogue:
- **Round Definition**: Each round begins with a user message and ends with an assistant response (either clarifying questions or a synthesized `RequirementBrief`).
- **Round Cap**: `MAX_FOLLOWUP_ROUNDS = 3`. Once round 3 is reached, the system prompt instructs the assistant that this is the final turn and it MUST return a `RequirementBrief`. Further questions are strictly forbidden.
- **Intake Dialogue Payload (`POST /api/intake/turn`)**:
  - Request: `{ "session_id": string | null, "text": string (1..4000) }`
  - Response: `{ "status": "needs_info" | "ready", "session_id": string, "round": int, "questions": list[IntakeQuestion], "brief": RequirementBrief | null }`
  - `IntakeQuestion` object contract:
    - `question`: `string` (1..200 characters, required)
    - `suggested_answer`: `string | null` (optional sensible default, max 200 characters; empty or >200 chars becomes null)
    - `options`: `list[string]` (0..3 items, each 1..60 characters; invalid or >60 char items dropped, extras beyond 3 dropped)
  - Assumption mapping: If user submits `A: (no answer, assume: X)`, the assistant records `X` in `brief.assumptions`. Direct user replies populate standard brief constraints and `numbers_given`.

#### Example Lifecycle Trace
1. **Turn 1 (Round 1)**:
   - User: *"We need a customer support bot with ticket escalation."*
   - Assistant (action: `ask`): Returns up to 3 structured questions with proactive suggested answers and options chips.
   - Status: `needs_info`, Round: 1.
2. **Turn 2 (Round 2)**:
   - User: *"We use Zendesk, expect 1,000 tickets daily, web chat only."*
   - Assistant (action: `ask`): Returns structured questions on auth and escalation policies.
   - Status: `needs_info`, Round: 2.
3. **Turn 3 (Round 3, Final)**:
   - User: *"Escalate to tier 2 after 2 failed attempts, single sign-on via OAuth2."*
   - Assistant (action: `ready`): Synthesizes `RequirementBrief` with summary, assumptions, and stated constraints. Code assigns IDs `bc1`, `bc2`, etc.
   - Status: `ready`, Round: 3.

### API Error Envelopes for Phase 3

| Error Code | HTTP Status | Trigger Condition | Response Payload |
| --- | --- | --- | --- |
| `VALIDATION_ERROR` | 422 | Input message empty, whitespace-only, or exceeding `MAX_INPUT_CHARS` | `{"code": "VALIDATION_ERROR", "message": "..."}` |
| `NOT_FOUND` | 404 | Unknown `session_id` or `design_id` | `{"code": "NOT_FOUND", "message": "..."}` |
| `SESSION_CLOSED` | 409 | Sending turn to session with status `ready`, `designed`, or `abandoned` | `{"code": "SESSION_CLOSED", "message": "..."}` |
| `NOT_READY` | 409 | Attempting design generation when session status is not `ready` | `{"code": "NOT_READY", "message": "..."}` |
| `DESIGN_FAILED` | 422 | Generator + repair loop exhausted 3 LLM calls without passing validation | `{"code": "DESIGN_FAILED", "message": "...", "issues": [...]}` |
| `LLM_NOT_CONFIGURED` | 503 | Missing API key or task model name in backend settings | `{"code": "LLM_NOT_CONFIGURED", "message": "..."}` |

### Database Tables (Phase 3)

- **`intake_sessions`**:
  - `id`: `String(36)` (UUID, primary key)
  - `status`: `String(20)` (`"collecting"`, `"ready"`, `"designed"`, `"abandoned"`)
  - `rounds`: `Integer` (current round count, default 1)
  - `turns_json`: `Text` (serialized JSON list of speaker turns)
  - `brief_json`: `Text` (nullable, serialized JSON of `RequirementBrief`)
  - `created_at`: `String(30)` (ISO 8601 UTC timestamp)
  - `updated_at`: `String(30)` (ISO 8601 UTC timestamp)
- **`designs`**:
  - `id`: `String(36)` (UUID, primary key)
  - `intake_session_id`: `String(36)` (UUID, unique foreign key to `intake_sessions.id`)
  - `current_version`: `Integer` (default 1)
  - `created_at`: `String(30)` (ISO 8601 UTC timestamp)
- **`design_versions`**:
  - `id`: `String(36)` (UUID, primary key)
  - `design_id`: `String(36)` (UUID, foreign key to `designs.id`)
  - `version_no`: `Integer` (1 for initial creation; unique per `design_id`)
  - `brief_json`: `Text` (snapshot of `RequirementBrief`)
  - `spec_json`: `Text` (serialized `ArchitectureSpec`)
  - `explanation_json`: `Text` (nullable, for Phase 4)
  - `prompt_version`: `String(50)` (`"architect_v1"` or `"architect_v1+architect_repair_v1"`)
  - `models_json`: `Text` (JSON map of model names used)
  - `warnings_json`: `Text` (JSON list of diagnostic warnings)
  - `change_note`: `Text` (nullable)
  - `created_at`: `String(30)` (ISO 8601 UTC timestamp)

### Error Envelopes for Phase 7 (Refinement Chat)

| Error Code | HTTP Status | Trigger Condition | Response Payload |
| --- | --- | --- | --- |
| `STALE_PATCH` | 409 | Patch base_version does not match design's current_version | `{"error": {"code": "STALE_PATCH", "message": "..."}}` |
| `PATCH_BLOCKED` | 409 | Patch fails re-validation upon accept | `{"error": {"code": "PATCH_BLOCKED", "message": "..."}}` |
| `CONFIRMATION_REQUIRED` | 409 | Patch uncovers brief requirements and confirm_drop is false | `{"error": {"code": "CONFIRMATION_REQUIRED", "message": "..."}}` |
| `CAP_TURNS` | 409 | User turn count reaches `MAX_REFINEMENT_TURNS` | `{"error": {"code": "CAP_TURNS", "message": "..."}}` |
| `CAP_VERSIONS` | 409 | Design version count reaches `MAX_VERSIONS` | `{"error": {"code": "CAP_VERSIONS", "message": "..."}}` |
| `RESTORE_CURRENT_VERSION` | 409 | Attempting to restore the current latest version | `{"error": {"code": "RESTORE_CURRENT_VERSION", "message": "..."}}` |

### Refinement Response Schemas (Phase 7)

- **`SuggestionsResponse`**:
  - `suggestions`: `list[SuggestionItemResponse]`
  - `discarded_count`: `Integer`
  - `discarded_issue_codes`: `list[list[str]]` (optional list of validation failure codes for each discarded suggestion)
- **`PatchSummary`**:
  - `id`: `String(36)` (UUID of the candidate patch)
  - `status`: `PatchStatus` (`"proposed"`, `"blocked"`, `"needs_confirmation"`)
  - `diff`: `DiffResult | None` (structural diff against base version)
  - `issues`: `list[ValidationIssue]` (validation issues discovered)
  - `ops_count`: `Integer` (number of operations in the proposed patch)
  - `preview_spec`: `ArchitectureSpec | None` (candidate architecture spec; populated ONLY when status is `"proposed"` or `"needs_confirmation"`, strictly `None` when `"blocked"`)
- **`VersionsResponse`**:
  - `versions`: `list[VersionSummaryItem]` (newest first, where each item has `version_no: Integer`, `created_at: String(30)` ISO 8601, `change_note: String | None`)

### Database Tables (Phase 7)

- **`chat_messages`**:
  - `id`: `String(36)` (UUID, primary key)
  - `design_id`: `String(36)` (UUID, foreign key to `designs.id`)
  - `role`: `String(20)` (`"user"` or `"assistant"`)
  - `text`: `Text` (message text, user up to 1000 chars, assistant up to 500 chars)
  - `created_at`: `String(30)` (ISO 8601 UTC timestamp)
- **`patches`**:
  - `id`: `String(36)` (UUID, primary key)
  - `design_id`: `String(36)` (UUID, foreign key to `designs.id`)
  - `kind`: `String(20)` (`"change"` or `"suggestion"`)
  - `base_version`: `Integer`
  - `status`: `String(30)` (`"proposed"`, `"blocked"`, `"needs_confirmation"`, `"accepted"`, `"rejected"`, `"superseded"`)
  - `patch_json`: `Text` (serialized `Patch`)
  - `diff_json`: `Text` (nullable, serialized `DiffResult`)
  - `issues_json`: `Text` (serialized list of `ValidationIssue`)
  - `reason`: `Text` (nullable, suggestion rationale)
  - `created_at`: `String(30)` (ISO 8601 UTC timestamp)
  - `decided_at`: `String(30)` (nullable, ISO 8601 UTC timestamp)



