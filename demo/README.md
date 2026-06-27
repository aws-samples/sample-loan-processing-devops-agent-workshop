# Demo labs — AWS DevOps Agent

These three labs are paired with the *Loan Processing* module of the
*Autonomous Incident Response with AWS DevOps Agent* workshop. Each lab
follows the same shape:

```
inject.sh    # break it
fix.sh       # roll back
README.md    # narrative for facilitators
```

## What you need

- AWS CLI v2, signed in to the account where the loan-management stack is
  deployed (in the workshop, this is automatic in CloudShell)
- The stack name (default: `LoanManagementSystem`)
- The CDK stack already deployed end-to-end

## Labs

| # | Folder | Failure mode | Target | What the agent finds |
|---|---|---|---|---|
| 1 | `lab1-rds-pool-exhaustion` | Data-tier saturation | `loan-service` ↔ RDS PostgreSQL | `RDS DatabaseConnections` alarm; `QueuePool limit reached` in service logs |
| 2 | `lab2-iam-s3-deny` | IAM drift | `audit-service` ↔ KYC S3 bucket | CloudTrail `AccessDenied` on `s3:PutObject` from the `audit-service` task role |
| 3 | `lab3-healthcheck-drift` | ALB target health | `disbursement-service` | `ALB UnHealthyHostCount` alarm; ECS task stop reason `Task failed ELB health checks` |

## Running a lab

```bash
cd demo/lab1-rds-pool-exhaustion
./inject.sh                     # induce the failure
# ... watch the DevOps Agent investigation in the agent console ...
./fix.sh                        # roll back
```

Each script is idempotent. Running `inject.sh` twice has the same effect as
running it once. Running `fix.sh` without a prior `inject.sh` is a no-op.

## Safety

- The scripts only operate on the `loan-management-cluster` ECS cluster, the
  `loan-management/*` Secrets Manager secrets, and the IAM role
  `loan-mgmt-audit-service-task-role`. They make no other API calls.
- They assume the `ALLOW_STRESS_TEST=true` CDK context flag is set (see the
  README at the repo root). With it disabled, Lab 1's API endpoint returns
  `403 Forbidden`.
- Run them only against your own workshop account.
