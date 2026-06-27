#!/usr/bin/env bash
# =============================================================================
# Lab 3 (FIX): Roll disbursement-service back to the previous good task-def
# =============================================================================

set -euo pipefail

REGION="${AWS_REGION:-${AWS_DEFAULT_REGION:-us-east-1}}"
CLUSTER="${ECS_CLUSTER:-loan-management-cluster}"
SERVICE="${TARGET_SERVICE:-disbursement-service}"
BACKUP_FILE="/tmp/disbursement-good-taskdef.txt"

echo "==============================================================="
echo "  LAB 3 (FIX): Restore ${SERVICE}"
echo "==============================================================="

if [[ -f "${BACKUP_FILE}" ]]; then
    GOOD_TASKDEF="$(cat "${BACKUP_FILE}")"
    echo "Restoring saved task definition: ${GOOD_TASKDEF}"
else
    echo "WARN: ${BACKUP_FILE} not found. Using the previous revision in the family."
    CURRENT_TASKDEF="$(aws ecs describe-services \
        --cluster "${CLUSTER}" \
        --services "${SERVICE}" \
        --region "${REGION}" \
        --query 'services[0].taskDefinition' \
        --output text)"
    FAMILY="$(echo "${CURRENT_TASKDEF}" | awk -F'/' '{print $NF}' | awk -F':' '{print $1}')"
    REVISION="$(echo "${CURRENT_TASKDEF}" | awk -F':' '{print $NF}')"
    GOOD_REVISION=$((REVISION - 1))
    GOOD_TASKDEF="${FAMILY}:${GOOD_REVISION}"
    echo "  using ${GOOD_TASKDEF}"
fi

aws ecs update-service \
    --cluster "${CLUSTER}" \
    --service "${SERVICE}" \
    --task-definition "${GOOD_TASKDEF}" \
    --force-new-deployment \
    --region "${REGION}" \
    --query 'service.serviceName' \
    --output text > /dev/null

echo "Waiting for ${SERVICE} to stabilise..."
aws ecs wait services-stable \
    --cluster "${CLUSTER}" \
    --services "${SERVICE}" \
    --region "${REGION}"

echo ""
echo "${SERVICE} is healthy again."
