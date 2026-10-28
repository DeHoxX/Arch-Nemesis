# Pattern: Multi-Agent Conversational Router

## Topology
- `chat_client`: Layer 0, User Chat Client.
- `api_gateway`: Layer 1, Ingress Gateway.
- `intent_router`: Layer 2, Intent Classification and Routing Agent.
- `sales_agent`: Layer 3, Specialized Sales & Product Agent.
- `support_agent`: Layer 3, Technical Support & Troubleshooting Agent.
- `crm_database`: Layer 4, Customer Relationship Database.
- `ticket_system`: Layer 4, Issue Ticketing and Escalation API.

## Edges
- `chat_client` -> `api_gateway` (WebSocket / HTTPS)
- `api_gateway` -> `intent_router` (Inbound Turn)
- `intent_router` -> `sales_agent` (Route Sales Query)
- `intent_router` -> `support_agent` (Route Support Query)
- `sales_agent` -> `crm_database` (Record Opportunity)
- `support_agent` -> `ticket_system` (Create Incident)

## Invariant Constraints
- `must_pass_through`: all user conversations must pass through `intent_router`.
- `must_not_connect`: `chat_client` must not connect directly to `crm_database`.

