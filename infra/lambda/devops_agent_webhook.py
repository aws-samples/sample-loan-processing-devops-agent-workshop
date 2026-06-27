"""Lambda function that forwards CloudWatch Alarm events to AWS DevOps Agent.

Triggered by SNS subscription on the LoanMgmt-Alarms topic.

The webhook URL is treated as configuration and lives in a plain environment
variable. The HMAC shared secret is treated as a credential and is fetched
from AWS Secrets Manager at invocation time using the ARN supplied via the
WEBHOOK_SECRET_ARN environment variable. The fetched value is cached in
module-level state for the lifetime of the warm Lambda execution context to
avoid Secrets Manager calls on every invocation.

If either the URL or the secret ARN is empty (the default when no DevOps
Agent webhook is configured), the handler short-circuits and logs the event
without calling out.
"""

import base64
import hashlib
import hmac
import json
import os
import urllib.error
import urllib.request
from datetime import datetime

import boto3


WEBHOOK_URL = os.environ.get("WEBHOOK_URL", "")
WEBHOOK_SECRET_ARN = os.environ.get("WEBHOOK_SECRET_ARN", "")

# Module-level cache (persists across warm invocations).
_secrets_client = None
_cached_secret_value = None


def _get_webhook_secret() -> str:
    """Fetch the webhook HMAC secret from Secrets Manager, with warm-Lambda caching."""
    global _secrets_client, _cached_secret_value

    if not WEBHOOK_SECRET_ARN:
        return ""

    if _cached_secret_value is not None:
        return _cached_secret_value

    if _secrets_client is None:
        _secrets_client = boto3.client("secretsmanager")

    response = _secrets_client.get_secret_value(SecretId=WEBHOOK_SECRET_ARN)
    _cached_secret_value = response.get("SecretString", "")
    return _cached_secret_value


def lambda_handler(event, context):
    """Triggered by an SNS message wrapping a CloudWatch Alarm payload."""
    print(f"Received event: {json.dumps(event)[:1024]}")

    webhook_secret = _get_webhook_secret()
    if not WEBHOOK_URL or not webhook_secret:
        print(
            "INFO: webhook not configured (WEBHOOK_URL or WEBHOOK_SECRET_ARN empty); "
            "short-circuiting."
        )
        return {"statusCode": 200, "body": "Webhook not configured"}

    # Defence in depth: only allow https:// URLs. urllib supports custom and
    # file:// schemes, so we explicitly reject anything that is not https.
    # See bandit B310 / semgrep dynamic-urllib-use-detected.
    if not WEBHOOK_URL.lower().startswith("https://"):
        print(
            f"ERROR: WEBHOOK_URL must start with https:// (got: {WEBHOOK_URL[:32]}...); "
            "refusing to call out."
        )
        return {"statusCode": 400, "body": "Invalid WEBHOOK_URL scheme"}

    try:
        # SNS wrapper: extract the alarm payload from the first record.
        if "Records" in event:
            sns_message = json.loads(event["Records"][0]["Sns"]["Message"])
            alarm_name = sns_message.get("AlarmName", "Unknown")
            alarm_description = sns_message.get("AlarmDescription", "")
            new_state = sns_message.get("NewStateValue", "ALARM")
            reason = sns_message.get("NewStateReason", "")
            timestamp = sns_message.get(
                "StateChangeTime", datetime.utcnow().isoformat() + "Z"
            )
            region = sns_message.get("Region", "us-east-1")
            account_id = sns_message.get("AWSAccountId", "123456789012")
            metrics = []
        else:
            # Direct invocation (alarm action or test event).
            alarm_data = event.get("alarmData", {})
            alarm_name = alarm_data.get(
                "alarmName", event.get("detail", {}).get("alarmName", "Unknown")
            )
            alarm_description = alarm_data.get("configuration", {}).get("description", "")
            state = alarm_data.get("state", {})
            new_state = state.get("value", "ALARM")
            reason = state.get("reason", "")
            timestamp = state.get("timestamp", datetime.utcnow().isoformat() + "Z")
            region = event.get("region", "us-east-1")
            account_id = event.get("accountId", "123456789012")
            metrics = alarm_data.get("configuration", {}).get("metrics", [])

        if new_state != "ALARM":
            print(f"State is {new_state}, not ALARM. Skipping.")
            return {"statusCode": 200, "body": "Not in ALARM state"}

        metric_info = ""
        if metrics:
            metric = metrics[0].get("metricStat", {}).get("metric", {})
            metric_name = metric.get("name", "")
            namespace = metric.get("namespace", "")
            dimensions = metric.get("dimensions", {})
            metric_info = f"Metric: {namespace}/{metric_name}"
            if dimensions:
                metric_info += f" Dimensions: {json.dumps(dimensions)}"

        description = (
            f"CloudWatch Alarm: {alarm_name}\n"
            f"Account: {account_id} | Region: {region}\n"
            f"State: {new_state}\n"
            f"Reason: {reason}\n"
        )
        if alarm_description:
            description += f"Description: {alarm_description}\n"
        if metric_info:
            description += f"{metric_info}\n"

        payload = {
            "eventType": "incident",
            "incidentId": f"{alarm_name}-{timestamp}",
            "action": "created",
            "priority": "HIGH",
            "title": f"CloudWatch Alarm: {alarm_name}",
            "description": description,
            "timestamp": timestamp,
            "service": alarm_name.replace("LoanMgmt-", ""),
            "data": {
                "metadata": {
                    "alarmName": alarm_name,
                    "region": region,
                    "accountId": account_id,
                    "newState": new_state,
                    "reason": reason,
                    "alarmArn": event.get("alarmArn", ""),
                    "metrics": metrics,
                }
            },
        }

        payload_json = json.dumps(payload)
        event_timestamp = datetime.utcnow().strftime("%Y-%m-%dT%H:%M:%S.000Z")

        signature_string = f"{event_timestamp}:{payload_json}"
        signature = hmac.new(
            webhook_secret.encode("utf-8"),
            signature_string.encode("utf-8"),
            hashlib.sha256,
        ).digest()
        signature_b64 = base64.b64encode(signature).decode("utf-8")

        headers = {
            "Content-Type": "application/json",
            "x-amzn-event-timestamp": event_timestamp,
            "x-amzn-event-signature": signature_b64,
        }

        req = urllib.request.Request(
            WEBHOOK_URL,
            data=payload_json.encode("utf-8"),
            headers=headers,
            method="POST",
        )

        # URL scheme already validated to https:// above; safe to call out.
        with urllib.request.urlopen(req, timeout=15) as response:  # nosec B310 - scheme validated  # nosemgrep: dynamic-urllib-use-detected
            resp_body = response.read().decode("utf-8")
            print(f"Webhook response: {response.status} - {resp_body[:512]}")
            return {
                "statusCode": 200,
                "body": json.dumps(
                    {
                        "message": "Investigation triggered",
                        "alarm": alarm_name,
                        "webhookStatus": response.status,
                    }
                ),
            }

    except urllib.error.HTTPError as exc:
        error_body = exc.read().decode("utf-8") if exc.fp else str(exc)
        print(f"Webhook HTTP Error {exc.code}: {error_body[:512]}")
        return {"statusCode": exc.code, "body": error_body}

    except Exception as exc:  # noqa: BLE001 (re-raised after logging)
        print(f"Error: {exc}")
        raise
