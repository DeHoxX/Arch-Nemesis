# Pattern: LLM Tool Agent with Security Guardrails

## Topology
- `user_interface`: Layer 0, Chat / Workspace Interface.
- `input_guardrail`: Layer 1, Prompt Injection & Policy Filter.
- `agent_orchestrator`: Layer 2, Reasoning & Tool Dispatch Agent.
- `tool_registry`: Layer 3, Sandboxed API Tool Connectors.
- `output_guardrail`: Layer 4, PII & Hallucination Verifier.
- `audit_sink`: Layer 5, Immutable Interaction Telemetry Store.

## Edges
- `user_interface` -> `input_guardrail` (Inbound Prompt)
- `input_guardrail` -> `agent_orchestrator` (Sanitized Prompt)
- `agent_orchestrator` -> `tool_registry` (Execute Sandboxed Tool)
- `agent_orchestrator` -> `output_guardrail` (Candidate Response)
- `output_guardrail` -> `user_interface` (Verified Response)
- `output_guardrail` -> `audit_sink` (Audit Log)

## Invariant Constraints
- `must_pass_through`: all user prompts must pass through `input_guardrail`.
- `must_precede`: `input_guardrail` must precede `agent_orchestrator`.
- `must_precede`: `agent_orchestrator` must precede `output_guardrail`.

