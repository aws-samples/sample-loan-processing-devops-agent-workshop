# Lab 3 — ALB health-check drift on disbursement-service

## Story

A regulatory upgrade renamed the disbursement-service health endpoint from
`/health` to `/api/v2/health`. The application was redeployed with the new
route, but the **container** health check command (baked into the ECS task
definition) still points at the old `/health` path. New tasks start, fail
the container health check, get killed before they ever pass the ALB target
group, and the ALB ends up with zero healthy targets.

## Inject

```bash
./inject.sh
```

The script:

1. Captures the current task definition ARN of disbursement-service to `/tmp/disbursement-good-taskdef.txt`.
2. Registers a new task-definition revision with the container `HEALTHCHECK` command pointing at the non-existent `/api/v2/health` path.
3. Updates the service to the new revision and forces a new deployment.

## What the agent should find

- `LoanMgmt-ALB-UnhealthyHosts` alarm + `LoanMgmt-disbursement-NoRunningTasks`
- ECS task stop reason `Task failed ELB health checks` in the lifecycle events
- Task-definition diff between the previous good revision and the new one — the change is in the container `command`/`healthCheck`
- The CloudTrail `RegisterTaskDefinition` and `UpdateService` events that introduced the change

## Fix

```bash
./fix.sh
```

The fix script switches the service back to the saved good task-definition
ARN and forces a new deployment. Within a few minutes the ALB target group
returns to `healthy`.
