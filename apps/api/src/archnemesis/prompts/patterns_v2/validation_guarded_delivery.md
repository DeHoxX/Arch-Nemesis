Shape reference only. Do not copy these names or types; invent names for the user's need.

# Pattern: Validation-Guarded Synthesis and Delivery

## Topology
- `user_ingress` (illustrative): Layer 0, User Request Gateway.
- `input_guard` (illustrative): Layer 1, Input Validation & Sanitization Guardrail.
- `orchestrator_agent` (illustrative, needs_model=true): Layer 2, Task Decomposition Agent.
- `execution_worker` (illustrative): Layer 3, Domain Execution Worker.
- `reference_store` (illustrative): Layer 3, Ground Truth Data Store.
- `candidate_generator` (illustrative, needs_model=true): Layer 4, Candidate Response Formulation Agent.
- `policy_critic_agent` (illustrative, needs_model=true): Layer 5, Output Verification & Policy Critic Agent.
- `output_guardrail` (illustrative): Layer 6, Schema & PII Filtering Filter.
- `delivery_endpoint` (illustrative): Layer 7, Verified Response Delivery Endpoint.
- `audit_sink` (illustrative): Layer 7, Immutable Decision Telemetry Store.

## Edges
- `user_ingress` -> `input_guard` (Inbound Request)
- `input_guard` -> `orchestrator_agent` (Sanitized Query)
- `orchestrator_agent` -> `execution_worker` (Dispatch Subtask)
- `execution_worker` -> `reference_store` (Query Reference)
- `reference_store` -> `candidate_generator` (Retrieved Context)
- `execution_worker` -> `candidate_generator` (Task Result)
- `candidate_generator` -> `policy_critic_agent` (Draft Output)
- `policy_critic_agent` -> `output_guardrail` (Critic Decision)
- `output_guardrail` -> `delivery_endpoint` (Safe Response)
- `policy_critic_agent` -> `audit_sink` (Verification Audit)
- `output_guardrail` -> `audit_sink` (Delivery Telemetry)
- `user_ingress` -> `audit_sink` (Session Timestamp)

## Invariant Constraints
- `must_pass_through`: all user traffic must pass through `input_guard`.
- `must_precede`: `candidate_generator` must precede `output_guardrail`.
- Auxiliary audit, logging, or telemetry sinks must be fed after the checkpoint node, not before.

