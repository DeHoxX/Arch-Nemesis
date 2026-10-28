# Pattern: Real-Time Event Streaming and Alerts

## Topology
- `iot_sensors`: Layer 0, Ingest Stream Producers.
- `stream_ingress`: Layer 1, Partitioned Message Buffer (e.g. Kafka / Kinesis).
- `stream_processor`: Layer 2, Stateful Stream Processing Worker (e.g. Flink).
- `anomaly_detector`: Layer 3, ML Anomaly Scoring Service.
- `notification_service`: Layer 4, Push Alert Dispatcher.
- `telemetry_store`: Layer 4, Time-Series Metric Database.

## Edges
- `iot_sensors` -> `stream_ingress` (MQTT / HTTPS)
- `stream_ingress` -> `stream_processor` (Partition Consumer)
- `stream_processor` -> `anomaly_detector` (Windowed Aggregates)
- `anomaly_detector` -> `notification_service` (Trigger Alert)
- `stream_processor` -> `telemetry_store` (Raw Metrics)

## Invariant Constraints
- `must_pass_through`: all sensor streams must pass through `stream_ingress`.
- `must_precede`: `stream_processor` must precede `notification_service`.

