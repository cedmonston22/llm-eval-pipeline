"""Send one prompt to three frontier models concurrently and publish results.

A single hardcoded prompt is sent to GPT-5.5 (OpenAI), Claude Opus 4.7
(Anthropic), and Gemini 3.5 Flash (Google) at the same time using asyncio. For
each model we capture the response text, token usage, and latency, then publish
each model's result as a separate JSON message to the ``eval_jobs`` queue on
Amazon MQ for RabbitMQ. The Lambda consumer decodes these and logs structured
eval records to CloudWatch.

Amazon MQ for RabbitMQ brokers require an encrypted AMQPS connection on
port 5671, so this connects over TLS. All credentials and API keys are read
from the environment so nothing sensitive is committed to source.

Required environment variables:
    AMAZON_MQ_HOST      e.g. b-xxxx.mq.us-east-1.amazonaws.com
    AMAZON_MQ_USERNAME  broker username
    AMAZON_MQ_PASSWORD  broker password
    OPENAI_API_KEY      OpenAI API key (read by AsyncOpenAI)
    ANTHROPIC_API_KEY   Anthropic API key (read by AsyncAnthropic)
    GEMINI_API_KEY      Google Gemini API key (read by genai.Client)

Optional:
    AMAZON_MQ_PORT      defaults to 5671
"""

from __future__ import annotations

import asyncio
import json
import os
import ssl
import sys
import time
from datetime import datetime, timezone
from pathlib import Path
from typing import Awaitable, Callable

import pika
from anthropic import AsyncAnthropic
from dotenv import load_dotenv
from google import genai
from openai import AsyncOpenAI

# Load the .env that lives next to this file, regardless of the cwd.
load_dotenv(Path(__file__).with_name(".env"))

QUEUE_NAME = "eval_jobs"

# The single prompt sent to every model.
PROMPT = "In two or three sentences, explain what a message queue is and why a system might use one."

# Anthropic's Messages API requires an explicit output cap.
MAX_TOKENS = 1024

# Each caller returns (response_text, input_tokens, output_tokens, total_tokens)
# and raises on any API error — evaluate_model() is responsible for catching it.
TokenUsage = tuple[str | None, int, int, int]
ModelCaller = Callable[[str, str], Awaitable[TokenUsage]]


async def call_openai(prompt: str, model_id: str) -> TokenUsage:
    """Call an OpenAI chat-completions model. Reads OPENAI_API_KEY from env."""
    client = AsyncOpenAI()
    resp = await client.chat.completions.create(
        model=model_id,
        messages=[{"role": "user", "content": prompt}],
    )
    text = resp.choices[0].message.content
    usage = resp.usage
    return text, usage.prompt_tokens, usage.completion_tokens, usage.total_tokens


async def call_anthropic(prompt: str, model_id: str) -> TokenUsage:
    """Call an Anthropic Messages model. Reads ANTHROPIC_API_KEY from env."""
    client = AsyncAnthropic()
    resp = await client.messages.create(
        model=model_id,
        max_tokens=MAX_TOKENS,
        messages=[{"role": "user", "content": prompt}],
    )
    text_parts = [block.text for block in resp.content if block.type == "text"]
    text = "".join(text_parts) if text_parts else None
    input_tokens = resp.usage.input_tokens
    output_tokens = resp.usage.output_tokens
    return text, input_tokens, output_tokens, input_tokens + output_tokens


async def call_gemini(prompt: str, model_id: str) -> TokenUsage:
    """Call a Google Gemini model.

    The google-genai client auto-detects GOOGLE_API_KEY but not
    GEMINI_API_KEY, so we pass whichever is set explicitly.
    """
    api_key = os.environ.get("GEMINI_API_KEY") or os.environ.get("GOOGLE_API_KEY")
    client = genai.Client(api_key=api_key)
    resp = await client.aio.models.generate_content(
        model=model_id,
        contents=prompt,
    )
    text = resp.text
    usage = resp.usage_metadata
    # Either count can be None when nothing is generated; default to 0. Compute
    # the total ourselves rather than trusting usage_metadata.total_token_count.
    input_tokens = usage.prompt_token_count or 0
    output_tokens = usage.candidates_token_count or 0
    return text, input_tokens, output_tokens, input_tokens + output_tokens


# Display label -> API model id -> async caller. The label is what lands in the
# message's "model" field; the model id is what the SDK call actually uses.
MODELS: list[tuple[str, str, ModelCaller]] = [
    ("GPT-5.5", "gpt-5.5", call_openai),
    ("Claude Opus 4.7", "claude-opus-4-7", call_anthropic),
    ("Gemini 3.5 Flash", "gemini-3.5-flash", call_gemini),
]


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


async def evaluate_model(
    label: str, model_id: str, caller: ModelCaller, prompt: str
) -> dict[str, object]:
    """Call one model and normalize the result into the message contract.

    Never raises: on any API error the failure is captured in the returned
    dict (``response`` and token fields become None, ``error`` holds the
    message) so a single failing model cannot abort the others.
    """
    start = time.perf_counter()
    record: dict[str, object] = {
        "prompt": prompt,
        "model": label,
        "response": None,
        "input_tokens": None,
        "output_tokens": None,
        "total_tokens": None,
        "latency_ms": None,
        "timestamp": datetime.now(timezone.utc).isoformat(),
        "error": None,
    }

    try:
        text, input_tokens, output_tokens, total_tokens = await caller(
            prompt, model_id
        )
        record["response"] = text
        record["input_tokens"] = input_tokens
        record["output_tokens"] = output_tokens
        record["total_tokens"] = total_tokens
    except Exception as exc:  # noqa: BLE001 — isolate any provider failure
        record["error"] = f"{type(exc).__name__}: {exc}"
        print(f"Model '{label}' failed: {record['error']}", file=sys.stderr)

    record["latency_ms"] = round((time.perf_counter() - start) * 1000, 2)
    return record


async def run_all_models(prompt: str) -> list[dict[str, object]]:
    """Run every model concurrently and return their normalized result dicts."""
    coros = [
        evaluate_model(label, model_id, caller, prompt)
        for label, model_id, caller in MODELS
    ]
    return await asyncio.gather(*coros)


def publish_results(
    parameters: pika.ConnectionParameters, results: list[dict[str, object]]
) -> int:
    """Publish each result as its own JSON message. Returns the failure count.

    A failed publish for one message is logged and skipped so the rest still
    go through.
    """
    failures = 0
    connection = pika.BlockingConnection(parameters)
    try:
        channel = connection.channel()
        # durable=True so the queue survives a broker restart.
        channel.queue_declare(queue=QUEUE_NAME, durable=True)

        for result in results:
            body = json.dumps(result)
            try:
                channel.basic_publish(
                    exchange="",
                    routing_key=QUEUE_NAME,
                    body=body,
                    properties=pika.BasicProperties(
                        content_type="application/json",
                        delivery_mode=pika.DeliveryMode.Persistent,
                    ),
                )
                print(f"Published result for '{result['model']}' to '{QUEUE_NAME}'")
            except Exception as exc:  # noqa: BLE001 — one bad publish shouldn't stop the rest
                failures += 1
                print(
                    f"Failed to publish result for '{result['model']}': {exc}",
                    file=sys.stderr,
                )
    finally:
        connection.close()

    return failures


def main() -> int:
    # Validate broker config before spending any API calls.
    try:
        parameters = get_connection_parameters()
    except RuntimeError as exc:
        print(f"Configuration error: {exc}", file=sys.stderr)
        return 1

    results = asyncio.run(run_all_models(PROMPT))
    publish_failures = publish_results(parameters, results)

    model_failures = sum(1 for r in results if r.get("error"))
    print(
        f"Done: {len(results)} model(s) evaluated, "
        f"{model_failures} model failure(s), {publish_failures} publish failure(s)."
    )
    return 1 if (model_failures or publish_failures) else 0


if __name__ == "__main__":
    raise SystemExit(main())
