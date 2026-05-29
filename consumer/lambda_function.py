"""AWS Lambda consumer for eval jobs delivered via Amazon MQ for RabbitMQ.

This Lambda is triggered by an Amazon MQ event source mapping on the
``eval_jobs`` queue. Because the broker is RabbitMQ (not ActiveMQ), the event
payload uses the ``rmqMessagesByQueue`` shape: a dict keyed by
``"<queue>::<vhost>"`` (e.g. ``eval_jobs::/``) whose values are lists of
message objects. Each message's ``data`` field is a base64-encoded JSON body.

For each message we decode the body, parse the JSON, extract the eval fields,
print the structured record as formatted JSON so it lands in CloudWatch, and
index it into the ``eval-jobs`` Elasticsearch index for later search/annotation.
"""

from __future__ import annotations

import base64
import binascii
import json
import os
import sys

from elasticsearch import ApiError, BadRequestError, Elasticsearch, TransportError

# The eval fields we surface from each message body. Missing keys become None.
RECORD_FIELDS = (
    "prompt",
    "model",
    "response",
    "input_tokens",
    "output_tokens",
    "total_tokens",
    "latency_ms",
    "timestamp",
    "error",
    "annotated",
)

# Elasticsearch index that receives every parsed eval record.
INDEX_NAME = "eval-jobs"

# Explicit mapping so field types are stable regardless of first-seen values.
INDEX_MAPPINGS = {
    "properties": {
        "prompt": {"type": "keyword"},
        "model": {"type": "keyword"},
        "error": {"type": "keyword"},
        "response": {"type": "text"},
        "input_tokens": {"type": "float"},
        "output_tokens": {"type": "float"},
        "total_tokens": {"type": "float"},
        "latency_ms": {"type": "float"},
        "timestamp": {"type": "date"},
        "annotated": {"type": "boolean"},
    }
}

# Built once per (warm) Lambda container and reused across invocations. Using
# os.environ[...] (not .get) makes a missing credential fail fast at cold start.
_es_client = Elasticsearch(
    cloud_id=os.environ["ELASTIC_CLOUD_ID"],
    api_key=os.environ["ELASTIC_API_KEY"],
)

# Whether we have already ensured the index exists in this container.
_index_ready = False


def _ensure_index() -> None:
    """Create the eval-jobs index with an explicit mapping if it is missing.

    Runs at most once per warm container and is safe against the create/create
    race between concurrent Lambdas (already-exists is treated as success).
    """
    global _index_ready
    if _index_ready:
        return
    if not _es_client.indices.exists(index=INDEX_NAME):
        try:
            _es_client.indices.create(index=INDEX_NAME, mappings=INDEX_MAPPINGS)
        except BadRequestError as exc:
            if getattr(exc, "error", "") != "resource_already_exists_exception":
                raise
    _index_ready = True


def parse_record(raw: dict[str, object]) -> dict[str, object]:
    """Project a decoded message body down to the structured eval record."""
    return {field: raw.get(field) for field in RECORD_FIELDS}


def decode_message(message: dict[str, object]) -> dict[str, object]:
    """Decode a single RabbitMQ message into its structured eval record.

    The ``data`` field is base64-encoded UTF-8 JSON. Raises ValueError if the
    payload cannot be base64-decoded or parsed as a JSON object.
    """
    data = message.get("data")
    if not isinstance(data, str):
        raise ValueError(f"message 'data' is missing or not a string: {data!r}")

    try:
        decoded = base64.b64decode(data, validate=True).decode("utf-8")
    except (binascii.Error, ValueError) as exc:
        raise ValueError(f"could not base64-decode message body: {exc}") from exc

    try:
        body = json.loads(decoded)
    except json.JSONDecodeError as exc:
        raise ValueError(f"message body is not valid JSON: {exc}") from exc

    if not isinstance(body, dict):
        raise ValueError(f"message body is not a JSON object: {body!r}")

    return parse_record(body)


def lambda_handler(event: dict[str, object], context: object) -> dict[str, int]:
    """Entry point for the Amazon MQ (RabbitMQ) trigger.

    Processes every message in the batch, printing each parsed record as
    formatted JSON and indexing it into Elasticsearch. A malformed message is
    logged to stderr and skipped so it does not fail the rest of the batch; an
    indexing failure is likewise logged and skipped (the message is still
    counted as processed since it was decoded and logged). Returns a summary of
    how many messages were processed versus failed.
    """
    messages_by_queue = event.get("rmqMessagesByQueue", {})
    if not isinstance(messages_by_queue, dict):
        raise ValueError(
            "event is missing a valid 'rmqMessagesByQueue' mapping; "
            "is this Lambda wired to an Amazon MQ for RabbitMQ trigger?"
        )

    processed = 0
    failed = 0
    for queue_key, messages in messages_by_queue.items():
        for message in messages:
            try:
                record = decode_message(message)
            except ValueError as exc:
                failed += 1
                print(
                    f"Skipping malformed message on '{queue_key}': {exc}",
                    file=sys.stderr,
                )
                continue

            processed += 1
            print(json.dumps(record, indent=2))

            try:
                _ensure_index()
                _es_client.index(index=INDEX_NAME, document=record)
            except (ApiError, TransportError) as exc:
                print(
                    f"Failed to index record into '{INDEX_NAME}': {exc}",
                    file=sys.stderr,
                )

    return {"processed": processed, "failed": failed}
