#!/usr/bin/env bash
# =============================================================================
# Lab 1 (FIX): Recover from RDS connection pool exhaustion
# =============================================================================
# Forces a new deployment of loan-service. ECS drains the old tasks (whose
# psycopg2 holders are still inside `pg_sleep(...)`), starts fresh tasks,
# and the connection count drops back below the alarm threshold.
# =============================================================================

set -euo pipefail

REGION="${AWS_REGION:-${AWS_DEFAULT_REGION:-us-east-1}}"
CLUSTER="${ECS_CLUSTER:-loan-management-cluster}"
SERVICE="${TARGET_SERVICE:-loan-service}"

echo "==============================================================="
echo "  LAB 1 (FIX): Recovering loan-service"
echo "==============================================================="

echo "Forcing new deployment of ${SERVICE} in cluster ${CLUSTER} (region ${REGION})..."
aws ecs update-service \
    --cluster "${CLUSTER}" \
    --service "${SERVICE}" \
    --force-new-deployment \
    --region "${REGION}" \
    --query 'service.{status: status, desiredCount: desiredCount, runningCount: runningCount}' \
    --output table

echo ""
echo "Waiting for the service to stabilise (this takes ~2 minutes)..."
aws ecs wait services-stable \
    --cluster "${CLUSTER}" \
    --services "${SERVICE}" \
    --region "${REGION}"

echo ""
echo "Service is stable. AWS/RDS DatabaseConnections should drop below the"
echo "alarm threshold within the next minute as the old tasks are drained."
echo ""
echo "Verify:"
echo "  aws cloudwatch describe-alarms --alarm-names LoanMgmt-RDS-HighConnections \\"
echo "    --query 'MetricAlarms[0].StateValue'"
