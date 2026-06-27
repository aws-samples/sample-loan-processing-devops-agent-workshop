#!/usr/bin/env bash
# =============================================================================
# Lab 2 (INJECT): IAM AccessDenied on S3 — audit-service KYC archival
# =============================================================================
# Replaces the audit-service task role's S3 inline policy with one that
# allows GET/HEAD only. Subsequent KYC PutObject calls return AccessDenied.
#
# Saves the original policy under /tmp/audit-task-role-policy-backup.json
# so `fix.sh` can restore it.
# =============================================================================

set -euo pipefail

REGION="${AWS_REGION:-${AWS_DEFAULT_REGION:-us-east-1}}"
CLUSTER="${ECS_CLUSTER:-loan-management-cluster}"
SERVICE="${TARGET_SERVICE:-audit-service}"
ROLE_NAME="${AUDIT_TASK_ROLE_NAME:-loan-mgmt-audit-service-task-role}"
BACKUP_FILE="/tmp/audit-task-role-policy-backup.json"

echo "==============================================================="
echo "  LAB 2 (INJECT): Detach S3 PutObject from ${ROLE_NAME}"
echo "==============================================================="

# Find the inline policy on the role (CDK names them based on the construct).
POLICY_NAME="$(aws iam list-role-policies --role-name "${ROLE_NAME}" \
    --query 'PolicyNames[0]' --output text)"

if [[ -z "${POLICY_NAME}" || "${POLICY_NAME}" == "None" ]]; then
    echo "ERROR: ${ROLE_NAME} has no inline policy to modify." >&2
    exit 1
fi

echo "Step 1: backing up current inline policy '${POLICY_NAME}' to ${BACKUP_FILE}"
aws iam get-role-policy \
    --role-name "${ROLE_NAME}" \
    --policy-name "${POLICY_NAME}" \
    --query 'PolicyDocument' \
    --output json > "${BACKUP_FILE}"

# Resolve the KYC bucket name from the CDK stack outputs.
KYC_BUCKET="$(aws cloudformation describe-stacks \
    --stack-name "${LOAN_STACK_NAME:-LoanManagementSystem}" \
    --query 'Stacks[0].Outputs[?OutputKey==`KycBucketName`].OutputValue' \
    --output text 2>/dev/null || true)"

if [[ -z "${KYC_BUCKET}" || "${KYC_BUCKET}" == "None" ]]; then
    # Fall back: assume bucket prefix
    echo "  (KycBucketName not found in stack outputs — using a wildcard ARN)"
    BUCKET_ARN="arn:aws:s3:::*loan-mgmt-kyc*"
else
    BUCKET_ARN="arn:aws:s3:::${KYC_BUCKET}"
fi
echo "  KYC bucket ARN target: ${BUCKET_ARN}"

# Build a stripped-down policy: GET/HEAD on the bucket only, no PutObject.
cat > /tmp/audit-task-role-policy-strip.json <<EOF
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Effect": "Allow",
      "Action": [
        "s3:GetObject",
        "s3:GetObjectVersion",
        "s3:GetBucketLocation",
        "s3:ListBucket"
      ],
      "Resource": [
        "${BUCKET_ARN}",
        "${BUCKET_ARN}/*"
      ]
    },
    {
      "Effect": "Allow",
      "Action": "secretsmanager:GetSecretValue",
      "Resource": "arn:aws:secretsmanager:*:*:secret:loan-management/*"
    }
  ]
}
EOF

echo "Step 2: replacing inline policy with read-only S3 + Secrets Manager"
aws iam put-role-policy \
    --role-name "${ROLE_NAME}" \
    --policy-name "${POLICY_NAME}" \
    --policy-document file:///tmp/audit-task-role-policy-strip.json

echo "Step 3: forcing new deployment of ${SERVICE} so cached creds are refreshed"
aws ecs update-service \
    --cluster "${CLUSTER}" \
    --service "${SERVICE}" \
    --force-new-deployment \
    --region "${REGION}" \
    --query 'service.serviceName' \
    --output text > /dev/null

echo ""
echo "==============================================================="
echo "  FAULT INJECTED"
echo "==============================================================="
echo ""
echo "  Subsequent POST /api/v1/audit/kyc/archive will return 502 AccessDenied."
echo ""
echo "  Watch the alarm:"
echo "    aws cloudwatch describe-alarms --alarm-names LoanMgmt-ALB-High5xxErrors"
echo ""
echo "  Watch CloudTrail for the AccessDenied events:"
echo "    aws cloudtrail lookup-events \\"
echo "      --lookup-attributes AttributeKey=EventName,AttributeValue=PutObject \\"
echo "      --max-results 5"
echo ""
echo "  When you are done, recover with: ./fix.sh"
