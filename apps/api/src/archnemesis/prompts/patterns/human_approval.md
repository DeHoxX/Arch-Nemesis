# Pattern: Human-in-the-Loop Approval Workflow

## Topology
- `action_trigger`: Layer 0, Inbound Request / Task Producer.
- `evaluation_engine`: Layer 1, Automated Policy & Risk Evaluator.
- `approval_queue`: Layer 2, Pending Review State Queue.
- `human_reviewer_ui`: Layer 1, Reviewer Portal / Inbox.
- `execution_worker`: Layer 3, Action Execution Dispatcher.
- `audit_log`: Layer 4, Immutable Compliance Audit Store.

## Edges
- `action_trigger` -> `evaluation_engine` (Submit Task)
- `evaluation_engine` -> `approval_queue` (Enqueue High Risk Task)
- `human_reviewer_ui` -> `approval_queue` (Fetch & Review)
- `approval_queue` -> `execution_worker` (Approve & Dispatch)
- `execution_worker` -> `audit_log` (Log Execution Record)

## Invariant Constraints
- `must_precede`: `approval_queue` must precede `execution_worker`.
- `must_not_connect`: `action_trigger` must not connect directly to `execution_worker`.

