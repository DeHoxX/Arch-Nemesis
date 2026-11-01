Shape reference only. Do not copy these names or types; invent names for the user's need.

# Pattern: Layered Asynchronous Event Processing

## Topology
- `event_producer` (illustrative): Layer 0, Inbound Event Producer.
- `ingress_gateway` (illustrative): Layer 1, Event Ingress Gateway.
- `buffer_queue` (illustrative): Layer 2, Distributed Partitioned Queue.
- `consumer_worker` (illustrative): Layer 3, Asynchronous Message Consumer.
- `triage_agent` (illustrative, needs_model=true): Layer 3, Contextual Event Triage Agent.
- `fast_decision_agent` (illustrative, needs_model=true): Layer 4, Low-Latency Decision Agent.
- `notification_dispatcher` (illustrative): Layer 5, Real-Time Alert Dispatcher.
- `deep_analysis_worker` (illustrative): Layer 4, Deep Analytical Extraction Worker.
- `state_database` (illustrative): Layer 5, Queryable Operational State Database.
- `analytical_warehouse` (illustrative): Layer 5, Historical Aggregate Store.
- `telemetry_sink` (illustrative): Layer 5, Telemetry & Security Audit Store.

## Edges
- `event_producer` -> `ingress_gateway` (Publish Event)
- `ingress_gateway` -> `buffer_queue` (Enqueue Event)
- `buffer_queue` -> `consumer_worker` (Pull Batch)
- `consumer_worker` -> `triage_agent` (Analyze Event Body)
- `triage_agent` -> `fast_decision_agent` (Urgent Route)
- `fast_decision_agent` -> `notification_dispatcher` (Trigger Alert)
- `fast_decision_agent` -> `state_database` (Record Decision)
- `triage_agent` -> `deep_analysis_worker` (Standard Route)
- `deep_analysis_worker` -> `state_database` (Save Normalized Entities)
- `deep_analysis_worker` -> `analytical_warehouse` (Batch Archive)
- `ingress_gateway` -> `telemetry_sink` (Ingress Metric)
- `consumer_worker` -> `telemetry_sink` (Processing Latency)
- `notification_dispatcher` -> `telemetry_sink` (Delivery Status)

## Invariant Constraints
- `must_pass_through`: all events must pass through `buffer_queue`.
- `must_precede`: `consumer_worker` must precede `notification_dispatcher`.
- Auxiliary audit, logging, or telemetry sinks must be fed after the checkpoint node, not before.

