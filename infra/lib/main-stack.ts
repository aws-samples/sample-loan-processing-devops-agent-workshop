import * as cdk from 'aws-cdk-lib';
import { Construct } from 'constructs';
import { VpcConstruct } from './vpc-stack';
import { DatabaseConstruct } from './database-stack';
import { CacheConstruct } from './cache-stack';
import { EcrConstruct } from './ecr-stack';
import { EcsConstruct } from './ecs-stack';
import { AlbConstruct } from './alb-stack';
import { FrontendConstruct } from './frontend-stack';
import { KycBucketConstruct } from './kyc-bucket-stack';
import { MonitoringConstruct } from './monitoring-stack';

/**
 * Top-level stack for the Loan Management workshop sample.
 *
 * CDK context flags (pass with `-c key=value`):
 *   - productionMode (default: false)             – multi-AZ, longer retention, RETAIN policies
 *   - enableDemoSeed (default: true)              – seeds workshop personas at first boot
 *   - allowStressTest (default: false)            – enables the chaos-engineering endpoint on loan-service
 *   - certificateArn (default: undef)             – ACM cert ARN to enable HTTPS:443 on the ALB
 *   - imageTag (default: 'latest')                – ECR image tag the ECS tasks pull
 *   - clusterName (default: loan-management-cluster)
 *   - corsOrigins (default: https://*.cloudfront.net)
 *   - devops_agent_webhook_url (default: '')      – plain URL, no Secrets Manager resource
 *   - devops_agent_webhook_secret (default: '')   – HMAC secret; presence triggers Secrets Manager creation
 */
export class MainStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props?: cdk.StackProps) {
    super(scope, id, props);

    const productionMode = this.node.tryGetContext('productionMode') === 'true';
    const enableDemoSeed = (this.node.tryGetContext('enableDemoSeed') ?? 'true') !== 'false';
    const allowStressTest = this.node.tryGetContext('allowStressTest') === 'true';
    const certificateArn = this.node.tryGetContext('certificateArn') as string | undefined;
    const imageTag = (this.node.tryGetContext('imageTag') as string | undefined) ?? 'latest';
    const clusterName =
      (this.node.tryGetContext('clusterName') as string | undefined) ?? 'loan-management-cluster';
    const devopsAgentWebhookUrl =
      (this.node.tryGetContext('devops_agent_webhook_url') as string | undefined) ?? '';
    const devopsAgentWebhookSecret =
      (this.node.tryGetContext('devops_agent_webhook_secret') as string | undefined) ?? '';

    const vpc = new VpcConstruct(this, 'Vpc');

    const database = new DatabaseConstruct(this, 'Database', {
      vpc: vpc.vpc,
      securityGroup: vpc.rdsSecurityGroup,
      productionMode,
    });

    const cache = new CacheConstruct(this, 'Cache', {
      vpc: vpc.vpc,
      securityGroup: vpc.redisSecurityGroup,
    });

    const ecr = new EcrConstruct(this, 'Ecr', { productionMode });

    // S3 bucket for tamper-evident KYC documents (audit-service writes here).
    // Lab 2 revokes the audit-service task role's PutObject on this bucket.
    const kyc = new KycBucketConstruct(this, 'Kyc');

    const corsAllowedOrigins =
      (this.node.tryGetContext('corsOrigins') as string | undefined) ??
      'https://*.cloudfront.net';

    const ecs = new EcsConstruct(this, 'Ecs', {
      vpc: vpc.vpc,
      securityGroup: vpc.ecsSecurityGroup,
      repositories: ecr.repositories,
      dbSecret: database.secret,
      dbEndpoint: database.instance.dbInstanceEndpointAddress,
      dbPort: database.instance.dbInstanceEndpointPort,
      redisEndpoint: cache.redisEndpoint,
      redisPort: cache.redisPort,
      redisAuthSecret: cache.authSecret,
      kycBucket: kyc.bucket,
      corsAllowedOrigins,
      clusterName,
      imageTag,
      enableDemoSeed,
      allowStressTest,
    });

    const alb = new AlbConstruct(this, 'Alb', {
      vpc: vpc.vpc,
      securityGroup: vpc.albSecurityGroup,
      services: ecs.services,
      certificateArn,
    });

    const frontend = new FrontendConstruct(this, 'Frontend', { alb: alb.alb });

    new MonitoringConstruct(this, 'Monitoring', {
      clusterName: ecs.cluster.clusterName,
      services: ecs.services,
      database: database.instance,
      alb: alb.alb,
      devopsAgentWebhookUrl,
      devopsAgentWebhookSecret,
    });

    new cdk.CfnOutput(this, 'AlbDnsName', { value: alb.dnsName, exportName: 'LoanMgmt-AlbDns' });
    new cdk.CfnOutput(this, 'CloudFrontUrl', { value: frontend.distributionUrl, exportName: 'LoanMgmt-CloudFrontUrl' });
    new cdk.CfnOutput(this, 'DistributionId', { value: frontend.distribution.distributionId, exportName: 'LoanMgmt-DistributionId' });
    new cdk.CfnOutput(this, 'RdsEndpoint', { value: database.instance.dbInstanceEndpointAddress, exportName: 'LoanMgmt-RdsEndpoint' });
    new cdk.CfnOutput(this, 'RedisEndpoint', { value: cache.redisEndpoint, exportName: 'LoanMgmt-RedisEndpoint' });
    new cdk.CfnOutput(this, 'EcsClusterName', { value: ecs.cluster.clusterName, exportName: 'LoanMgmt-EcsCluster' });
    new cdk.CfnOutput(this, 'FrontendBucketName', { value: frontend.bucket.bucketName, exportName: 'LoanMgmt-FrontendBucket' });
    new cdk.CfnOutput(this, 'JwtSecretArn', { value: ecs.jwtSecret.secretArn, exportName: 'LoanMgmt-JwtSecretArn' });
    new cdk.CfnOutput(this, 'RedisAuthSecretArn', { value: cache.authSecret.secretArn, exportName: 'LoanMgmt-RedisAuthSecretArn' });
    new cdk.CfnOutput(this, 'AuditTaskRoleName', {
      value: (ecs.taskRoles.audit as cdk.aws_iam.Role).roleName,
      description: 'Task role for audit-service. Lab 2 (`demo/lab2-iam-s3-deny`) detaches/restores the bucket grant on this role.',
      exportName: 'LoanMgmt-AuditTaskRole',
    });

    cdk.Tags.of(this).add('Project', 'LoanManagementSystem');
    cdk.Tags.of(this).add('Environment', productionMode ? 'Production' : 'Workshop');
  }
}
