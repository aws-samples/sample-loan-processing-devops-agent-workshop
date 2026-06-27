# Lab 2 — IAM AccessDenied on S3 (audit-service KYC archival)

## Story

A well-meaning security review tightened IAM policies across the loan-app
account. One of the changes detached the inline `s3:PutObject` statement
from the audit-service task role. The audit-service still runs, the API
still accepts archival requests, but every KYC document upload now returns
HTTP 502 with an `AccessDenied` upstream error.

The change leaves no trace on the application — the agent has to find it in
CloudTrail.

## Inject

```bash
./inject.sh
```

The script:

1. Captures the current inline policy on the `loan-mgmt-audit-service-task-role` IAM role and saves it to `/tmp/audit-task-role-policy-backup.json`.
2. Replaces the inline policy with one that only allows S3 GET/HEAD on the bucket — no PutObject.
3. Forces a new deployment of audit-service so cached IAM credentials are refreshed inside the running tasks.

After injection, the next `POST /api/v1/audit/kyc/archive` returns 502
"AccessDenied", the ALB 5xx alarm fires, and DevOps Agent investigates.

## What the agent should find

- ALB 5xx alarm + audit-service container logs containing `AccessDenied`
- CloudTrail entries:
  - `iam:PutRolePolicy` on `loan-mgmt-audit-service-task-role` (the change that did it)
  - `s3:PutObject` API calls returning `AccessDenied` from the audit-service task role
- The IAM policy diff between the saved version and the current one

## Fix

```bash
./fix.sh
```

The fix script restores the saved inline policy via `iam:PutRolePolicy`, then
forces a new deployment so the audit-service tasks pick up fresh credentials.
KYC archival starts succeeding again within ~60 seconds.
