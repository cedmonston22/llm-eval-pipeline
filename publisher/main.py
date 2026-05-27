"""Publish a test message to the eval_jobs queue on Amazon MQ for RabbitMQ.

Amazon MQ for RabbitMQ brokers require an encrypted AMQPS connection on
port 5671, so this connects over TLS. Credentials and the broker endpoint
are read from the environment so nothing sensitive is committed to source.

Required environment variables:
    AMAZON_MQ_HOST      e.g. b-xxxx.mq.us-east-1.amazonaws.com
    AMAZON_MQ_USERNAME  broker username
    AMAZON_MQ_PASSWORD  broker password

Optional:
    AMAZON_MQ_PORT      defaults to 5671
"""

from __future__ import annotations

import json
import os
import ssl
import sys
from datetime import datetime, timezone
from pathlib import Path

import pika
from dotenv import load_dotenv

# Load the .env that lives next to this file, regardless of the cwd.
load_dotenv(Path(__file__).with_name(".env"))

QUEUE_NAME = "eval_jobs"


def get_connection_parameters() -> pika.ConnectionParameters:
    """Build TLS-enabled connection parameters from environment variables."""
    host = os.environ.get("AMAZON_MQ_HOST")
    username = os.environ.get("AMAZON_MQ_USERNAME")
    password = os.environ.get("AMAZON_MQ_PASSWORD")
    port = int(os.environ.get("AMAZON_MQ_PORT", "5671"))

    missing = [
        name
        for name, value in (
            ("AMAZON_MQ_HOST", host),
            ("AMAZON_MQ_USERNAME", username),
            ("AMAZON_MQ_PASSWORD", password),
        )
        if not value
    ]
    if missing:
        raise RuntimeError(
            f"Missing required environment variable(s): {', '.join(missing)}"
        )

    ssl_context = ssl.create_default_context()
    ssl_options = pika.SSLOptions(ssl_context, server_hostname=host)
    credentials = pika.PlainCredentials(username, password)

    return pika.ConnectionParameters(
        host=host,
        port=port,
        credentials=credentials,
        ssl_options=ssl_options,
    )


def build_message() -> dict[str, object]:
    """Construct the test payload to publish."""
    return {
        "type": "test",
        "message": "hello from publisher",
        "timestamp": datetime.now(timezone.utc).isoformat(),
    }


def main() -> int:
    try:
        parameters = get_connection_parameters()
    except RuntimeError as exc:
        print(f"Configuration error: {exc}", file=sys.stderr)
        return 1

    connection = pika.BlockingConnection(parameters)
    try:
        channel = connection.channel()
        # durable=True so the queue survives a broker restart.
        channel.queue_declare(queue=QUEUE_NAME, durable=True)

        body = json.dumps(build_message())
        channel.basic_publish(
            exchange="",
            routing_key=QUEUE_NAME,
            body=body,
            properties=pika.BasicProperties(
                content_type="application/json",
                delivery_mode=pika.DeliveryMode.Persistent,
            ),
        )
        print(f"Published test message to '{QUEUE_NAME}': {body}")
    finally:
        connection.close()

    return 0


if __name__ == "__main__":
    raise SystemExit(main())
