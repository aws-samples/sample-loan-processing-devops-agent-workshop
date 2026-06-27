import * as cdk from 'aws-cdk-lib';
import * as ec2 from 'aws-cdk-lib/aws-ec2';
import * as elasticache from 'aws-cdk-lib/aws-elasticache';
import * as secretsmanager from 'aws-cdk-lib/aws-secretsmanager';
import { Construct } from 'constructs';

export interface CacheConstructProps {
  readonly vpc: ec2.Vpc;
  readonly securityGroup: ec2.SecurityGroup;
}

/**
 * ElastiCache Redis cluster with encryption-in-transit, encryption-at-rest,
 * and AUTH token (stored in AWS Secrets Manager). The auth token is exposed
 * via the `authSecret` property so ECS task definitions can inject it.
 */
export class CacheConstruct extends Construct {
  public readonly redisEndpoint: string;
  public readonly redisPort: string;
  public readonly authSecret: secretsmanager.ISecret;

  constructor(scope: Construct, id: string, props: CacheConstructProps) {
    super(scope, id);

    // AUTH token (16-128 printable ASCII chars per ElastiCache requirements)
    const authSecret = new secretsmanager.Secret(this, 'RedisAuthToken', {
      secretName: 'loan-management/redis-auth-token',
      generateSecretString: {
        excludePunctuation: true,
        passwordLength: 32,
      },
      removalPolicy: cdk.RemovalPolicy.DESTROY,
    });
    this.authSecret = authSecret;

    const privateSubnets = props.vpc.selectSubnets({
      subnetType: ec2.SubnetType.PRIVATE_WITH_EGRESS,
    });

    const subnetGroup = new elasticache.CfnSubnetGroup(this, 'RedisSubnetGroup', {
      description: 'Subnet group for Loan Management Redis',
      subnetIds: privateSubnets.subnetIds,
      cacheSubnetGroupName: 'loan-mgmt-redis-subnet-group',
    });

    // Use a ReplicationGroup so we can enable in-transit encryption + AUTH.
    const replicationGroup = new elasticache.CfnReplicationGroup(this, 'RedisReplicationGroup', {
      replicationGroupId: 'loan-mgmt-redis',
      replicationGroupDescription: 'Loan Management Redis (encrypted, AUTH enabled)',
      engine: 'redis',
      engineVersion: '7.0',
      cacheNodeType: 'cache.t3.micro',
      numCacheClusters: 1,
      automaticFailoverEnabled: false,
      multiAzEnabled: false,
      cacheSubnetGroupName: subnetGroup.cacheSubnetGroupName,
      securityGroupIds: [props.securityGroup.securityGroupId],
      atRestEncryptionEnabled: true,
      transitEncryptionEnabled: true,
      authToken: authSecret.secretValue.unsafeUnwrap(),
    });
    replicationGroup.addDependency(subnetGroup);

    this.redisEndpoint = replicationGroup.attrPrimaryEndPointAddress;
    this.redisPort = replicationGroup.attrPrimaryEndPointPort;

    cdk.Tags.of(this).add('Project', 'LoanManagementSystem');
  }
}
