import * as cdk from 'aws-cdk-lib';
import * as ecr from 'aws-cdk-lib/aws-ecr';
import { Construct } from 'constructs';

export const SERVICE_NAMES = [
  'auth',
  'customer',
  'loan',
  'underwriting',
  'disbursement',
  'repayment',
  'collections',
  'notification',
  'audit',
  'dashboard',
] as const;

export type ServiceName = (typeof SERVICE_NAMES)[number];

export interface EcrConstructProps {
  readonly productionMode?: boolean;
}

/**
 * References the per-service ECR repositories.
 *
 * The repositories themselves are created and managed outside of CDK by the
 * GitLab CI `ecr-login` stage (idempotent `aws ecr describe-repositories ||
 * create-repository`). That ordering is required because the `build-images`
 * stage runs before `deploy` and must push to the repositories first.
 *
 * For local `cdk deploy`, run `infra/scripts/ensure-ecr-repos.sh` first to
 * create the repositories, or use the `build-and-push.sh` helper which calls
 * the same idempotent describe-or-create.
 */
export class EcrConstruct extends Construct {
  public readonly repositories: Record<string, ecr.IRepository>;

  constructor(scope: Construct, id: string, _props?: EcrConstructProps) {
    super(scope, id);
    this.repositories = {};

    for (const serviceName of SERVICE_NAMES) {
      this.repositories[serviceName] = ecr.Repository.fromRepositoryName(
        this,
        `${serviceName}Repo`,
        `loan-mgmt/${serviceName}-service`,
      );
    }

    cdk.Tags.of(this).add('Project', 'LoanManagementSystem');
  }
}
