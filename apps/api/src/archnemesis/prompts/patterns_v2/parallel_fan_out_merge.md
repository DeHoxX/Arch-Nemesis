Shape reference only. Do not copy these names or types; invent names for the user's need.

# Pattern: Parallel Multi-Branch Execution and Join

## Topology
- `ingress_gateway` (illustrative): Layer 0, Ingress Endpoint.
- `input_filter` (illustrative): Layer 1, Input Security and Format Guardrail.
- `task_dispatcher` (illustrative, needs_model=true): Layer 2, Task Decomposition & Routing Agent.
- `payload_worker` (illustrative): Layer 3, Specialized Payload Processing Worker.
- `feature_agent` (illustrative, needs_model=true): Layer 3, Entity & Feature Extraction Agent.
- `knowledge_store` (illustrative): Layer 4, Context Knowledge Store.
- `stream_worker` (illustrative): Layer 3, Real-Time Stream Processor.
- `classification_agent` (illustrative, needs_model=true): Layer 4, Domain Classification Model.
- `validation_worker` (illustrative): Layer 3, Schema Normalization Worker.
- `policy_agent` (illustrative, needs_model=true): Layer 4, Policy & Constraint Evaluation Agent.
- `join_aggregator` (illustrative, needs_model=true): Layer 5, Synthesis & Consensus Join Agent.
- `delivery_sink` (illustrative): Layer 6, Outbound Result Dispatcher.
- `audit_store` (illustrative): Layer 6, Compliance Audit & Telemetry Store.

## Edges
- `ingress_gateway` -> `input_filter` (Inbound Traffic)
- `input_filter` -> `task_dispatcher` (Sanitized Request)
- `task_dispatcher` -> `payload_worker` (Dispatch Subtask A)
- `payload_worker` -> `feature_agent` (Extracted Units)
- `feature_agent` -> `knowledge_store` (Read/Write State)
- `feature_agent` -> `join_aggregator` (Feature Signals)
- `task_dispatcher` -> `stream_worker` (Dispatch Subtask B)
- `stream_worker` -> `classification_agent` (Aggregated Windows)
- `classification_agent` -> `join_aggregator` (Classification Score)
- `task_dispatcher` -> `validation_worker` (Dispatch Subtask C)
- `validation_worker` -> `policy_agent` (Normalized Schema)
- `policy_agent` -> `join_aggregator` (Compliance Assessment)
- `join_aggregator` -> `delivery_sink` (Synthesized Output)
- `join_aggregator` -> `audit_store` (Execution Trace)
- `task_dispatcher` -> `audit_store` (Dispatch Audit)

## Invariant Constraints
- `must_pass_through`: all user traffic must pass through `input_filter`.
- `must_precede`: `task_dispatcher` must precede `join_aggregator`.
- Auxiliary audit, logging, or telemetry sinks must be fed after the checkpoint node, not before.

