#!/bin/bash
# Build and push all service Docker images to ECR (linux/amd64 for ECS Fargate).
#
# Account ID and region are resolved from the active AWS credentials.
# In Workshop Studio the participant's federated role is already configured.
# For local use, run `aws configure` or `aws sso login` first.

set -euo pipefail

REGION="${AWS_REGION:-${AWS_DEFAULT_REGION:-us-east-1}}"
ACCOUNT_ID="$(aws sts get-caller-identity --query Account --output text 2>/dev/null || true)"

if [[ -z "${ACCOUNT_ID}" ]]; then
  echo "ERROR: Could not resolve AWS account ID. Run 'aws configure' or 'aws sso login' first." >&2
  exit 1
fi

ECR_BASE="${ACCOUNT_ID}.dkr.ecr.${REGION}.amazonaws.com"
PLATFORM="${PLATFORM:-linux/amd64}"

SERVICES=(auth customer loan underwriting disbursement repayment collections notification audit dashboard)

echo "Logging in to ECR ${ECR_BASE} ..."
aws ecr get-login-password --region "${REGION}" | docker login --username AWS --password-stdin "${ECR_BASE}"

echo "Building and pushing all services (platform: ${PLATFORM})..."
for SERVICE in "${SERVICES[@]}"; do
  REPO="${ECR_BASE}/loan-mgmt/${SERVICE}-service"
  echo ""
  echo "=== Building ${SERVICE}-service ==="
  docker build \
    --platform "${PLATFORM}" \
    -f "services/${SERVICE}-service/Dockerfile" \
    --build-context shared=shared \
    -t "${REPO}:latest" \
    "services/${SERVICE}-service"

  echo "Pushing ${SERVICE}-service..."
  docker push "${REPO}:latest"
  echo "Done: ${SERVICE}-service"
done

echo ""
echo "All images pushed successfully to ${ECR_BASE}"
