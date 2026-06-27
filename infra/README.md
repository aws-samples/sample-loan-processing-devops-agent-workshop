# Loan Management System — AWS CDK Infrastructure

AWS CDK (TypeScript) infrastructure for deploying the Loan Management System to an AWS Isengard account.

## Architecture

```
┌─────────────────────────────────────────────────────────────────────┐
│                         CloudFront                                    │
│                    (Frontend SPA + /api/* → ALB)                      │
└──────────────────────────────┬──────────────────────────────────────┘
                               │
┌──────────────────────────────▼──────────────────────────────────────┐
│                    Application Load Balancer                          │
│              (Path-based routing to ECS services)                     │
│                        Public Subnets                                 │
└──────────────────────────────┬──────────────────────────────────────┘
                               │
┌──────────────────────────────▼──────────────────────────────────────┐
│                      ECS Fargate Cluster                              │
│  ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌──────────┐              │
│  │   auth   │ │ customer │ │   loan   │ │underwrite│  ...          │
│  │  :8001   │ │  :8002   │ │  :8003   │ │  :8004   │              │
│  └──────────┘ └──────────┘ └──────────┘ └──────────┘              │
│                        Private Subnets                               │
└──────────────────────────────┬──────────────────────────────────────┘
                               │
          ┌────────────────────┼────────────────────┐
          │                    │                    │
┌─────────▼─────────┐ ┌───────▼───────┐ ┌─────────▼─────────┐
│  RDS PostgreSQL   │ │ ElastiCache   │ │  Secrets Manager  │
│    (loandb)       │ │   Redis       │ │  (DB + JWT)       │
│  Private Subnet   │ │ Private Subnet│ │                   │
└───────────────────┘ └───────────────┘ └───────────────────┘
```

## Prerequisites

- **AWS CLI** v2 configured with Isengard credentials
- **AWS CDK CLI** v2: `npm install -g aws-cdk`
- **Node.js** 18+ and npm
- **Docker** (for building and pushing container images)
- **TypeScript**: installed as project dependency

## Quick Start

### 1. Install dependencies

```bash
cd infra
npm install
```

### 2. Bootstrap CDK (first time only)

```bash
cdk bootstrap aws://<ACCOUNT_ID>/<REGION>
```

### 3. Build and push Docker images to ECR

Run the provided script to build all service images and push to ECR:

```bash
chmod +x scripts/push-images.sh
./scripts/push-images.sh
```

Or manually for a single service:

```bash
AWS_ACCOUNT_ID=$(aws sts get-caller-identity --query Account --output text)
AWS_REGION=$(aws configure get region)

# Login to ECR
aws ecr get-login-password --region $AWS_REGION | \
  docker login --username AWS --password-stdin $AWS_ACCOUNT_ID.dkr.ecr.$AWS_REGION.amazonaws.com

# Build and push (example: auth-service)
docker build -t loan-mgmt/auth-service ../services/auth-service
docker tag loan-mgmt/auth-service:latest $AWS_ACCOUNT_ID.dkr.ecr.$AWS_REGION.amazonaws.com/loan-mgmt/auth-service:latest
docker push $AWS_ACCOUNT_ID.dkr.ecr.$AWS_REGION.amazonaws.com/loan-mgmt/auth-service:latest
```

### 4. Deploy the stack

```bash
npx cdk deploy --all --require-approval never
```

### 5. Post-deployment: Run database migrations

After deployment, connect to the RDS instance and run migrations. You can use an ECS exec session or a bastion host:

```bash
# Get the RDS endpoint from stack outputs
aws cloudformation describe-stacks --stack-name LoanManagementSystem \
  --query 'Stacks[0].Outputs[?OutputKey==`RdsEndpoint`].OutputValue' --output text

# Option: Run migrations via ECS Exec (requires enabling execute-command on service)
aws ecs execute-command --cluster loan-management-cluster \
  --task <TASK_ID> --container auth-container \
  --interactive --command "alembic upgrade head"
```

### 6. Upload frontend assets

```bash
# Build the React frontend
cd ../frontend
npm run build

# Upload to S3
BUCKET_NAME=$(aws cloudformation describe-stacks --stack-name LoanManagementSystem \
  --query 'Stacks[0].Outputs[?OutputKey==`FrontendBucketName`].OutputValue' --output text)

aws s3 sync build/ s3://$BUCKET_NAME/ --delete
```

### 7. Access the application

After deployment, the stack outputs will show:
- **CloudFront URL**: Frontend application
- **ALB DNS**: Direct API access

## Stack Outputs

| Output | Description |
|--------|-------------|
| AlbDnsName | ALB DNS for direct API access |
| CloudFrontUrl | CloudFront URL for the frontend |
| RdsEndpoint | RDS PostgreSQL endpoint |
| RedisEndpoint | ElastiCache Redis endpoint |
| EcsClusterName | ECS cluster name |
| FrontendBucketName | S3 bucket for frontend assets |

## Services and Routing

| Path Pattern | Service | Port |
|---|---|---|
| `/api/v1/auth/*` | auth-service | 8001 |
| `/api/v1/customers/*` | customer-service | 8002 |
| `/api/v1/loan-products/*` | loan-service | 8003 |
| `/api/v1/applications/*` | loan-service | 8003 |
| `/api/v1/underwriting/*` | underwriting-service | 8004 |
| `/api/v1/disbursements/*` | disbursement-service | 8005 |
| `/api/v1/loans/*` | disbursement-service | 8005 |
| `/api/v1/repayments/*` | repayment-service | 8006 |
| `/api/v1/collections/*` | collections-service | 8007 |
| `/api/v1/notifications/*` | notification-service | 8008 |
| `/api/v1/audit/*` | audit-service | 8009 |
| `/api/v1/dashboard/*` | dashboard-service | 8010 |

## Resource Sizing (Demo)

| Resource | Size |
|----------|------|
| ECS Tasks | 256 CPU / 512 MB each |
| RDS | db.t3.medium |
| ElastiCache | cache.t3.micro |
| Auto-scaling | 1-2 tasks per service |

## Cleanup

To destroy all resources:

```bash
cdk destroy --all
```

This will remove all AWS resources. The stack uses `RemovalPolicy.DESTROY` on all resources for easy cleanup.

## Cost Estimate (Demo)

Approximate monthly cost for this demo setup in us-west-2:
- ECS Fargate (10 services × 0.25 vCPU × 0.5 GB): ~$30/month
- RDS db.t3.medium: ~$50/month
- ElastiCache cache.t3.micro: ~$12/month
- NAT Gateway: ~$32/month
- ALB: ~$16/month
- CloudFront: ~$1/month (minimal traffic)
- **Total estimate: ~$141/month**

Remember to `cdk destroy` when not in use.
