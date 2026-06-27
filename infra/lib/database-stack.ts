import * as cdk from 'aws-cdk-lib';
import * as ec2 from 'aws-cdk-lib/aws-ec2';
import * as rds from 'aws-cdk-lib/aws-rds';
import * as secretsmanager from 'aws-cdk-lib/aws-secretsmanager';
import { Construct } from 'constructs';

export interface DatabaseConstructProps {
  readonly vpc: ec2.Vpc;
  readonly securityGroup: ec2.SecurityGroup;
  /** Toggle production-grade defaults (multi-AZ, deletion protection, longer retention). */
  readonly productionMode?: boolean;
}

/**
 * RDS PostgreSQL.
 *
 * Workshop note:
 *   - Demo mode (default) destroys the database when the stack is removed
 *     so participants can clean up cheaply.
 *   - Set `productionMode: true` (or pass `-c productionMode=true` on CDK)
 *     to flip on multi-AZ, deletion protection, and 7-day backups.
 */
export class DatabaseConstruct extends Construct {
  public readonly instance: rds.DatabaseInstance;
  public readonly secret: secretsmanager.ISecret;

  constructor(scope: Construct, id: string, props: DatabaseConstructProps) {
    super(scope, id);

    const productionMode = props.productionMode ?? false;

    const credentials = rds.Credentials.fromGeneratedSecret('postgres', {
      secretName: 'loan-management/rds-credentials',
    });

    this.instance = new rds.DatabaseInstance(this, 'LoanDb', {
      engine: rds.DatabaseInstanceEngine.postgres({
        version: rds.PostgresEngineVersion.VER_15,
      }),
      instanceType: ec2.InstanceType.of(ec2.InstanceClass.T3, ec2.InstanceSize.MEDIUM),
      vpc: props.vpc,
      vpcSubnets: { subnetType: ec2.SubnetType.PRIVATE_WITH_EGRESS },
      securityGroups: [props.securityGroup],
      credentials,
      databaseName: 'loandb',
      allocatedStorage: 20,
      maxAllocatedStorage: productionMode ? 200 : 50,
      multiAz: productionMode,
      publiclyAccessible: false,
      deletionProtection: productionMode,
      removalPolicy: productionMode ? cdk.RemovalPolicy.RETAIN : cdk.RemovalPolicy.DESTROY,
      backupRetention: cdk.Duration.days(productionMode ? 7 : 1),
      storageEncrypted: true,
      iamAuthentication: true,
      enablePerformanceInsights: productionMode,
      cloudwatchLogsExports: ['postgresql'],
    });

    this.secret = this.instance.secret!;

    cdk.Tags.of(this).add('Project', 'LoanManagementSystem');
  }
}
