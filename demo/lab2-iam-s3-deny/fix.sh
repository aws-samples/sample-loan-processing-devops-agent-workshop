#!/usr/bin/env bash
# =============================================================================
# Lab 2 (FIX): Restore audit-service S3 PutObject permission
# =============================================================================

set -euo pipefail

REGION="${AWS_REGION:-${AWS_DEFAULT_REGION:-us-east-1}}"
CLUSTER="${ECS_CLUSTER:-loan-management-cluster}"
SERVICE="${TARGET_SERVICE:-audit-service}"
ROLE_NAME="${AUDIT_TASK_ROLE_NAME:-loan-mgmt-audit-service-task-role}"
BACKUP_FILE="/tmp/audit-task-role-policy-backup.json"

echo "==============================================================="
echo "  LAB 2 (FIX): Restore S3 PutObject on ${ROLE_NAME}"
echo "==============================================================="

POLICY_NAME="$(aws iam list-role-policies --role-name "${ROLE_NAME}" \
    --query 'PolicyNames[0]' --output text)"

if [[ -z "${POLICY_NAME}" || "${POLICY_NAME}" == "None" ]]; then
    echo "ERROR: ${ROLE_NAME} has no inline policy. Restoration aborted." >&2
    exit 1
fi

if [[ ! -f "${BACKUP_FILE}" ]]; then
    # Idempotent path: inject.sh writes the backup before removing PutObject, so
    # a missing backup means the fault was never injected here or was already
    # fixed. If the role's current inline policy already grants s3:PutObject,
    # treat this as a safe no-op instead of erroring under 'set -e'.
    if aws iam get-role-policy --role-name "${ROLE_NAME}" --policy-name "${POLICY_NAME}" \
        --query 'PolicyDocument.Statement[].Action' --output text 2>/dev/null \
        | grep -q "s3:PutObject"; then
        echo "  ${ROLE_NAME} already grants s3:PutObject — nothing to restore."
        exit 0
    fi
    echo "ERROR: ${BACKUP_FILE} not found and s3:PutObject is not currently granted." >&2
    echo "  inject.sh must be run before fix.sh in the same shell session." >&2
    exit 1
fi

echo "Restoring inline policy '${POLICY_NAME}' from ${BACKUP_FILE}..."
aws iam put-role-policy \
    --role-name "${ROLE_NAME}" \
    --policy-name "${POLICY_NAME}" \
    --policy-document "file://${BACKUP_FILE}"

echo "Forcing new deployment of ${SERVICE}..."
aws ecs update-service \
    --cluster "${CLUSTER}" \
    --service "${SERVICE}" \
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
echo "Restored. POST /api/v1/audit/kyc/archive should succeed again."
echo "Backup file ${BACKUP_FILE} preserved for reference."
