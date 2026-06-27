#!/usr/bin/env bash
# Idempotent: create the 10 per-service ECR repositories used by the loan
# management application. CDK references them via Repository.fromRepositoryName,
# so they must exist before `cdk deploy` runs.
#
# In GitLab CI the `ecr-login` stage does the same thing inline. Use this
# script for local `cdk deploy` runs.

set -euo pipefail

REGION="${AWS_REGION:-${AWS_DEFAULT_REGION:-us-east-1}}"
PROJECT="loan-mgmt"

SERVICES=(auth customer loan underwriting disbursement repayment collections notification audit dashboard)

for SVC in "${SERVICES[@]}"; do
  REPO="${PROJECT}/${SVC}-service"
  if aws ecr describe-repositories --repository-names "${REPO}" --region "${REGION}" >/dev/null 2>&1; then
    echo "  ${REPO} already exists"
  else
    echo "  creating ${REPO}"
    aws ecr create-repository \
      --repository-name "${REPO}" \
      --image-tag-mutability MUTABLE \
      --image-scanning-configuration scanOnPush=true \
      --encryption-configuration encryptionType=AES256 \
      --region "${REGION}" \
      --query 'repository.repositoryUri' --output text
  fi
done

echo "Done. All 10 ECR repositories present in ${REGION}."
