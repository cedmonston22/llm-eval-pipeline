"""AWS Lambda consumer for eval jobs delivered via Amazon MQ for RabbitMQ.

This Lambda is triggered by an Amazon MQ event source mapping on the
``eval_jobs`` queue. Because the broker is RabbitMQ (not ActiveMQ), the event
payload uses the ``rmqMessagesByQueue`` shape: a dict keyed by
``"<queue>::<vhost>"`` (e.g. ``eval_jobs::/``) whose values are lists of
message objects. Each message's ``data`` field is a base64-encoded JSON body.

For each message we decode the body, parse the JSON, extract the eval fields,
and print the structured record as formatted JSON so it lands in CloudWatch.
"""

from __future__ import annotations

import base64
import binascii
import json
import sys

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
    formatted JSON. A malformed message is logged to stderr and skipped so it
    does not fail the rest of the batch. Returns a summary of how many messages
    were processed versus failed.
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

    return {"processed": processed, "failed": failed}
