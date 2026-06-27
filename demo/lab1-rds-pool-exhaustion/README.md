# Lab 1 — RDS connection pool exhaustion

## Story

A new "batch credit-score recalculation" job has been silently rolled out to
the loan-service. Every triggered run opens N raw PostgreSQL connections and
holds them open for a minute while it walks the customer ledger. The instance
runs out of free connection slots, and every new application submission
starts to time out at the database layer.

## Inject

```bash
./inject.sh
```

The script POSTs to the loan-service's admin-only `db-pool-stress` endpoint
which spins up 50 background threads, each opening a fresh `psycopg2`
connection (bypassing SQLAlchemy's pool) and running `SELECT pg_sleep(60)`.

Within 60 seconds you will see:

- `AWS/RDS DatabaseConnections` climbing past the alarm threshold
- The `LoanMgmt-RDS-HighConnections` CloudWatch alarm fires
- The webhook Lambda forwards the alarm to your DevOps Agent

## What the agent should find

- The alarm metric (`AWS/RDS DatabaseConnections`)
- Service logs showing `sqlalchemy.exc.TimeoutError: QueuePool limit ...
  reached, connection timed out` from concurrent application submissions
- A correlation against recent CloudTrail (`ecs:UpdateService`,
  `lambda:Invoke`) entries — there isn't one, which suggests the saturation
  is from inside the loan-service rather than an upstream change

## Fix

```bash
./fix.sh
```

The fix script issues `aws ecs update-service --force-new-deployment` against
loan-service. Existing tasks are drained, which closes their long-lived
psycopg2 connections, and `DatabaseConnections` drops back below the alarm
threshold within 2-3 minutes.

In production, the long-term fix would be: bound the batch job to a
purpose-built worker pool, add a circuit breaker on connection acquisition,
and run heavy reads against a read replica. The workshop just rolls the
service.
