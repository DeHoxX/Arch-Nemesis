# Pattern: Retrieval Augmented Generation (QA)

## Topology
- `client`: Layer 0, Web / API Client.
- `api_gateway`: Layer 1, API Gateway / Router.
- `embedding_service`: Layer 2, Vector Embedding Generator.
- `vector_db`: Layer 3, Vector Database Index.
- `rag_orchestrator`: Layer 2, RAG Orchestration Engine.
- `llm_service`: Layer 3, Inference LLM.

## Edges
- `client` -> `api_gateway` (HTTPS)
- `api_gateway` -> `rag_orchestrator` (gRPC)
- `rag_orchestrator` -> `embedding_service` (Embed Query)
- `rag_orchestrator` -> `vector_db` (Similarity Search)
- `rag_orchestrator` -> `llm_service` (Prompt with Context)

## Invariant Constraints
- `api_gateway` must exist.
- `must_pass_through`: all user traffic from `client` must pass through `api_gateway`.

