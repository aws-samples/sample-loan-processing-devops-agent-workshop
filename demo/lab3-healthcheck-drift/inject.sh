#!/usr/bin/env bash
# =============================================================================
# Lab 3 (INJECT): Container health-check drift on disbursement-service
# =============================================================================
# Registers a new disbursement-service task-definition revision whose
# container HEALTHCHECK command points at /api/v2/health (which does not
# exist on the running image). New tasks immediately fail their health
# check and ECS kills them before they can register with the ALB.
#
# Saves the previous good task-definition ARN to /tmp/disbursement-good-taskdef.txt.
# =============================================================================

set -euo pipefail

REGION="${AWS_REGION:-${AWS_DEFAULT_REGION:-us-east-1}}"
CLUSTER="${ECS_CLUSTER:-loan-management-cluster}"
SERVICE="${TARGET_SERVICE:-disbursement-service}"
PORT="${TARGET_PORT:-8005}"
BACKUP_FILE="/tmp/disbursement-good-taskdef.txt"

echo "==============================================================="
echo "  LAB 3 (INJECT): Health-check drift on ${SERVICE}"
echo "==============================================================="

CURRENT_TASKDEF="$(aws ecs describe-services \
    --cluster "${CLUSTER}" \
    --services "${SERVICE}" \
    --region "${REGION}" \
    --query 'services[0].taskDefinition' \
    --output text)"

if [[ -z "${CURRENT_TASKDEF}" || "${CURRENT_TASKDEF}" == "None" ]]; then
    echo "ERROR: could not look up current task definition for ${SERVICE}" >&2
    exit 1
fi

echo "Step 1: saving current good task definition: ${CURRENT_TASKDEF}"
echo "${CURRENT_TASKDEF}" > "${BACKUP_FILE}"

aws ecs describe-task-definition \
    --task-definition "${CURRENT_TASKDEF}" \
    --region "${REGION}" \
    --query 'taskDefinition' > /tmp/disbursement-current-td.json

echo "Step 2: rewriting the container health check to point at a non-existent path"
PORT="${PORT}" python3 - <<'PY'
import json, os

port = os.environ.get("PORT", "8005")
with open("/tmp/disbursement-current-td.json") as f:
    td = json.load(f)

for container in td["containerDefinitions"]:
    if container.get("healthCheck"):
        old = container["healthCheck"].get("command")
        container["healthCheck"]["command"] = [
            "CMD-SHELL", f"curl -f http://localhost:{port}/api/v2/health || exit 1"
        ]
        # Faster failure loop so the alarm fires within 2 minutes
        container["healthCheck"]["interval"] = 10
        container["healthCheck"]["timeout"] = 5
        container["healthCheck"]["retries"] = 2
        container["healthCheck"]["startPeriod"] = 5
        print(f"Health check changed: {old} -> {container['healthCheck']['command']}")

# Strip non-registerable fields
for field in (
    "taskDefinitionArn", "revision", "status", "requiresAttributes",
    "compatibilities", "registeredAt", "registeredBy",
):
    td.pop(field, None)

with open("/tmp/disbursement-bad-td.json", "w") as f:
    json.dump(td, f)
PY

echo "Step 3: registering broken task definition"
NEW_TASKDEF_ARN="$(aws ecs register-task-definition \
    --cli-input-json file:///tmp/disbursement-bad-td.json \
    --region "${REGION}" \
    --query 'taskDefinition.taskDefinitionArn' \
    --output text)"
echo "  registered ${NEW_TASKDEF_ARN}"

echo "Step 4: rolling ${SERVICE} forward to the broken revision"
aws ecs update-service \
    --cluster "${CLUSTER}" \
    --service "${SERVICE}" \
    --task-definition "${NEW_TASKDEF_ARN}" \
    --force-new-deployment \
    --region "${REGION}" \
    --query 'service.serviceName' \
    --output text > /dev/null

echo ""
echo "==============================================================="
echo "  FAULT INJECTED"
echo "==============================================================="
echo ""
echo "  Timeline:"
echo "    T+0s     New task starts with broken health check command"
echo "    T+30s    Container fails first 2 health-check probes"
echo "    T+60s    ECS stops the container; ALB target marked unhealthy"
echo "    T+90s    LoanMgmt-ALB-UnhealthyHosts alarm fires"
echo ""
echo "  Watch the alarms:"
echo "    aws cloudwatch describe-alarms \\"
echo "      --alarm-names LoanMgmt-ALB-UnhealthyHosts LoanMgmt-disbursement-NoRunningTasks"
echo ""
echo "  Watch the task lifecycle:"
echo "    aws ecs describe-services --cluster ${CLUSTER} --services ${SERVICE} \\"
echo "      --region ${REGION} --query 'services[0].events[:5]'"
echo ""
echo "  When you are done, recover with: ./fix.sh"
