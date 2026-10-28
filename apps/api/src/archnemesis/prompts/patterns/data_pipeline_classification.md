# Pattern: Batch Data Ingestion and Classification Pipeline

## Topology
- `object_storage`: Layer 0, Raw Document / File Store (e.g. S3).
- `ingestion_trigger`: Layer 1, File Drop Event Handler.
- `text_extractor`: Layer 2, OCR & Content Extraction Worker.
- `classifier_service`: Layer 3, ML Classification & Labeling Model.
- `structured_database`: Layer 4, Queryable Document Index (e.g. PostgreSQL).
- `analytics_warehouse`: Layer 4, Analytical Data Warehouse (e.g. BigQuery).

## Edges
- `object_storage` -> `ingestion_trigger` (ObjectCreated Notification)
- `ingestion_trigger` -> `text_extractor` (Dispatch Extract Task)
- `text_extractor` -> `classifier_service` (Raw Text Payload)
- `classifier_service` -> `structured_database` (Save Metadata & Labels)
- `classifier_service` -> `analytics_warehouse` (Export Aggregate Features)

## Invariant Constraints
- `must_precede`: `text_extractor` must precede `classifier_service`.
- `must_not_connect`: `object_storage` must not connect directly to `structured_database`.

