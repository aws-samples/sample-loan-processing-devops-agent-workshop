#!/usr/bin/env bash
# =============================================================================
# Lab 1 (INJECT): RDS connection pool exhaustion on loan-service
# =============================================================================
# Calls the loan-service admin-only `db-pool-stress` endpoint, which holds
# 50 PostgreSQL connections open for 60s. The RDS DatabaseConnections alarm
# fires, the webhook Lambda forwards the event, and DevOps Agent investigates.
#
# Required environment variables (or workshop bootstrap inputs):
#   API_BASE_URL    Base URL of the deployed loan API
#                   e.g. https://<your-cf>.cloudfront.net/api/v1
#   ADMIN_USERNAME  Username with ADMIN role (default: admin)
#   ADMIN_PASSWORD  Password for the admin user (default: Admin12345!)
#
# Idempotent: running this twice just queues another batch on top of the first.
# =============================================================================

set -euo pipefail

API_BASE_URL="${API_BASE_URL:-}"
ADMIN_USERNAME="${ADMIN_USERNAME:-admin}"
ADMIN_PASSWORD="${ADMIN_PASSWORD:-Admin12345!}"
HOLDERS="${HOLDERS:-100}"
HOLD_SECONDS="${HOLD_SECONDS:-60}"

if [[ -z "${API_BASE_URL}" ]]; then
    echo "ERROR: API_BASE_URL is required. Example:" >&2
    echo "  export API_BASE_URL=https://<your-cf>.cloudfront.net/api/v1" >&2
    exit 1
fi
if [[ -z "${ADMIN_PASSWORD}" ]]; then
    echo "ERROR: ADMIN_PASSWORD is empty." >&2
    echo "  The default 'Admin12345!' is documented in the README." >&2
    exit 1
fi

echo "==============================================================="
echo "  LAB 1 (INJECT): RDS connection pool exhaustion"
echo "==============================================================="
echo ""
echo "  This will hold ${HOLDERS} PostgreSQL connections open for ${HOLD_SECONDS}s,"
echo "  saturating the RDS instance connection pool."
echo ""

echo "Authenticating against ${API_BASE_URL} ..."
TOKEN="$(curl -fsS "${API_BASE_URL}/auth/login" \
    -X POST \
    -H "Content-Type: application/json" \
    -d "{\"username\":\"${ADMIN_USERNAME}\",\"password\":\"${ADMIN_PASSWORD}\"}" \
    | python3 -c 'import sys, json; print(json.load(sys.stdin).get("access_token", ""))')"

if [[ -z "${TOKEN}" ]]; then
    echo "Login failed. Verify ADMIN_USERNAME / ADMIN_PASSWORD and that the API is reachable." >&2
    exit 1
fi

echo "Authenticated. Triggering the connection-holding job..."
RESPONSE="$(curl -fsS "${API_BASE_URL}/applications/db-pool-stress?holders=${HOLDERS}&hold_seconds=${HOLD_SECONDS}" \
    -X POST \
    -H "Authorization: Bearer ${TOKEN}" \
    -H "Content-Type: application/json")"

echo "${RESPONSE}" | python3 -m json.tool 2>/dev/null || echo "${RESPONSE}"

echo ""
echo "==============================================================="
echo "  FAULT INJECTED"
echo "==============================================================="
echo ""
echo "  Timeline:"
echo "    T+0s     ${HOLDERS} PostgreSQL connections opened"
echo "    T+30s    AWS/RDS DatabaseConnections climbs past 80"
echo "    T+60s    LoanMgmt-RDS-HighConnections alarm fires"
echo "    T+90s    Webhook Lambda forwards alarm to DevOps Agent"
echo ""
echo "  Watch the alarm:"
echo "    aws cloudwatch describe-alarms --alarm-names LoanMgmt-RDS-HighConnections"
echo ""
echo "  Watch the loan-service logs for QueuePool exhaustion:"
echo "    aws logs tail /ecs/loan-mgmt/loan-service --since 5m"
echo ""
echo "  When you are done, recover with: ./fix.sh"
