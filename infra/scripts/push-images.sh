#!/bin/bash
# Build and push all service Docker images to ECR
# Usage: ./scripts/push-images.sh [region]

set -e

REGION="${1:-$(aws configure get region || echo 'us-west-2')}"
ACCOUNT_ID=$(aws sts get-caller-identity --query Account --output text)
ECR_BASE="$ACCOUNT_ID.dkr.ecr.$REGION.amazonaws.com"

SERVICES=(
  "auth"
  "customer"
  "loan"
  "underwriting"
  "disbursement"
  "repayment"
  "collections"
  "notification"
  "audit"
  "dashboard"
)

echo "============================================"
echo "Loan Management System - ECR Image Push"
echo "============================================"
echo "Account:  $ACCOUNT_ID"
echo "Region:   $REGION"
echo "Registry: $ECR_BASE"
echo "============================================"

# Login to ECR
echo ""
echo "Logging in to ECR..."
aws ecr get-login-password --region "$REGION" | \
  docker login --username AWS --password-stdin "$ECR_BASE"

# Build and push each service
for SERVICE in "${SERVICES[@]}"; do
  REPO_NAME="loan-mgmt/${SERVICE}-service"
  IMAGE_URI="$ECR_BASE/$REPO_NAME:latest"
  SERVICE_DIR="../services/${SERVICE}-service"

  echo ""
  echo "--------------------------------------------"
  echo "Building: $SERVICE-service"
  echo "--------------------------------------------"

  if [ ! -d "$SERVICE_DIR" ]; then
    echo "WARNING: Directory $SERVICE_DIR not found, skipping..."
    continue
  fi

  docker build -t "$REPO_NAME:latest" "$SERVICE_DIR"
  docker tag "$REPO_NAME:latest" "$IMAGE_URI"

  echo "Pushing: $IMAGE_URI"
  docker push "$IMAGE_URI"

  echo "Done: $SERVICE-service"
done

echo ""
echo "============================================"
echo "All images pushed successfully!"
echo "============================================"
