import * as cdk from 'aws-cdk-lib';
import * as ec2 from 'aws-cdk-lib/aws-ec2';
import * as ecs from 'aws-cdk-lib/aws-ecs';
import * as ecr from 'aws-cdk-lib/aws-ecr';
import * as iam from 'aws-cdk-lib/aws-iam';
import * as logs from 'aws-cdk-lib/aws-logs';
import * as s3 from 'aws-cdk-lib/aws-s3';
import * as secretsmanager from 'aws-cdk-lib/aws-secretsmanager';
import * as servicediscovery from 'aws-cdk-lib/aws-servicediscovery';
import { Construct } from 'constructs';
import { ServiceName } from './ecr-stack';

export interface EcsConstructProps {
  readonly vpc: ec2.Vpc;
  readonly securityGroup: ec2.SecurityGroup;
  readonly repositories: Record<string, ecr.IRepository>;
  readonly dbSecret: secretsmanager.ISecret;
  readonly dbEndpoint: string;
  readonly dbPort: string;
  readonly redisEndpoint: string;
  readonly redisPort: string;
  readonly redisAuthSecret: secretsmanager.ISecret;
  /** S3 bucket for tamper-evident KYC documents (audit-service writes here). */
  readonly kycBucket: s3.IBucket;
  readonly corsAllowedOrigins: string;
  readonly clusterName?: string;
  readonly imageTag?: string;
  readonly enableDemoSeed?: boolean;
  readonly allowStressTest?: boolean;
}

interface ServiceConfig {
  name: ServiceName;
  port: number;
  envOverrides?: Record<string, string>;
}

const SERVICE_CONFIGS: ServiceConfig[] = [
  { name: 'auth', port: 8001 },
  { name: 'customer', port: 8002 },
  { name: 'loan', port: 8003 },
  { name: 'underwriting', port: 8004 },
  { name: 'disbursement', port: 8005 },
  { name: 'repayment', port: 8006, envOverrides: { AUTO_DEBIT_SUCCESS_RATE: '0.9' } },
  { name: 'collections', port: 8007, envOverrides: { REMINDER_DAYS: '3', OVERDUE_NOTICE_DAYS: '7', LEGAL_NOTICE_DAYS: '15' } },
  { name: 'notification', port: 8008, envOverrides: { EMAIL_SIMULATION: 'true' } },
  { name: 'audit', port: 8009 },
  { name: 'dashboard', port: 8010 },
];

export class EcsConstruct extends Construct {
  public readonly cluster: ecs.Cluster;
  public readonly services: Record<string, ecs.FargateService>;
  /** Per-service Fargate task roles, exposed so the audit-service role can be referenced by name in Lab 2. */
  public readonly taskRoles: Record<string, iam.IRole>;
  public readonly jwtSecret: secretsmanager.Secret;

  constructor(scope: Construct, id: string, props: EcsConstructProps) {
    super(scope, id);

    this.cluster = new ecs.Cluster(this, 'LoanCluster', {
      vpc: props.vpc,
      clusterName: props.clusterName ?? 'loan-management-cluster',
      containerInsightsV2: ecs.ContainerInsights.ENABLED,
    });

    const namespace = this.cluster.addDefaultCloudMapNamespace({
      name: 'loan.local',
      type: servicediscovery.NamespaceType.DNS_PRIVATE,
      vpc: props.vpc,
    });

    this.jwtSecret = new secretsmanager.Secret(this, 'JwtSecret', {
      secretName: 'loan-management/jwt-secret',
      generateSecretString: {
        secretStringTemplate: JSON.stringify({}),
        generateStringKey: 'jwt_secret',
        excludePunctuation: true,
        passwordLength: 64,
      },
      removalPolicy: cdk.RemovalPolicy.DESTROY,
    });

    this.services = {};
    this.taskRoles = {};
    for (const config of SERVICE_CONFIGS) {
      const service = this.createFargateService(config, props, namespace);
      this.services[config.name] = service;
      this.taskRoles[config.name] = service.taskDefinition.taskRole;
    }

    cdk.Tags.of(this).add('Project', 'LoanManagementSystem');
  }

  private createFargateService(
    config: ServiceConfig,
    props: EcsConstructProps,
    namespace: servicediscovery.INamespace
  ): ecs.FargateService {
    const serviceName = `${config.name}-service`;

    const logGroup = new logs.LogGroup(this, `${config.name}Logs`, {
      logGroupName: `/ecs/loan-mgmt/${serviceName}`,
      retention: logs.RetentionDays.ONE_MONTH,
      removalPolicy: cdk.RemovalPolicy.DESTROY,
    });

    // Per-service task role. Each service gets its own — no shared role —
    // so Lab 2 can revoke `s3:PutObject` on a single role (audit-service)
    // without affecting any other service.
    const taskRole = new iam.Role(this, `${config.name}TaskRole`, {
      roleName: `loan-mgmt-${serviceName}-task-role`,
      assumedBy: new iam.ServicePrincipal('ecs-tasks.amazonaws.com'),
      description: `Task role for ${serviceName}`,
    });

    const taskDef = new ecs.FargateTaskDefinition(this, `${config.name}TaskDef`, {
      memoryLimitMiB: 512,
      cpu: 256,
      family: `loan-mgmt-${serviceName}`,
      taskRole,
    });

    // Resource-scoped grants — every service gets exactly the secrets it needs.
    props.dbSecret.grantRead(taskRole);
    this.jwtSecret.grantRead(taskRole);
    props.redisAuthSecret.grantRead(taskRole);

    // Audit service is the only writer to the KYC bucket. Lab 2 revokes
    // this single statement to simulate an inadvertent IAM tightening.
    if (config.name === 'audit') {
      props.kycBucket.grantPut(taskRole);
      props.kycBucket.grantRead(taskRole);
    }

    const containerConfig: ecs.ContainerDefinitionOptions = {
      image: ecs.ContainerImage.fromEcrRepository(
        props.repositories[config.name],
        props.imageTag ?? 'latest'
      ),
      logging: ecs.LogDrivers.awsLogs({ logGroup, streamPrefix: serviceName }),
      environment: {
        SERVICE_NAME: serviceName,
        SERVICE_PORT: config.port.toString(),
        DB_HOST: props.dbEndpoint,
        DB_PORT: props.dbPort,
        DB_NAME: 'loandb',
        REDIS_HOST: props.redisEndpoint,
        REDIS_PORT: props.redisPort,
        // Use rediss:// (TLS) since transit encryption is enabled in CDK.
        REDIS_URL: `rediss://${props.redisEndpoint}:${props.redisPort}/0`,
        JWT_ALGORITHM: 'HS256',
        JWT_ISSUER: 'loan-management-system',
        JWT_AUDIENCE: 'loan-management-api',
        APP_ENV: 'workshop',
        CORS_ALLOWED_ORIGINS: props.corsAllowedOrigins,
        LOG_LEVEL: 'INFO',
        ENABLE_TRUSTED_HOST: 'false',
        ENABLE_DEMO_SEED: (props.enableDemoSeed ?? true) ? 'true' : 'false',
        ALLOW_STRESS_TEST:
          config.name === 'loan' && (props.allowStressTest ?? false) ? 'true' : 'false',
        ...(config.name === 'audit' && { KYC_BUCKET_NAME: props.kycBucket.bucketName }),
        ...config.envOverrides,
      },
      secrets: {
        DB_USERNAME: ecs.Secret.fromSecretsManager(props.dbSecret, 'username'),
        DB_PASSWORD: ecs.Secret.fromSecretsManager(props.dbSecret, 'password'),
        JWT_SECRET: ecs.Secret.fromSecretsManager(this.jwtSecret, 'jwt_secret'),
        REDIS_PASSWORD: ecs.Secret.fromSecretsManager(props.redisAuthSecret),
      },
      healthCheck: {
        command: ['CMD-SHELL', `curl -f http://localhost:${config.port}/health || exit 1`],
        interval: cdk.Duration.seconds(30),
        timeout: cdk.Duration.seconds(5),
        retries: 3,
        startPeriod: cdk.Duration.seconds(60),
      },
    };

    const container = taskDef.addContainer(`${config.name}Container`, containerConfig);
    container.addPortMappings({ containerPort: config.port, protocol: ecs.Protocol.TCP });

    const fargateService = new ecs.FargateService(this, `${config.name}Service`, {
      cluster: this.cluster,
      taskDefinition: taskDef,
      desiredCount: 1,
      securityGroups: [props.securityGroup],
      vpcSubnets: { subnetType: ec2.SubnetType.PRIVATE_WITH_EGRESS },
      assignPublicIp: false,
      serviceName,
      circuitBreaker: { rollback: true },
      minHealthyPercent: 0,
      maxHealthyPercent: 200,
      cloudMapOptions: {
        name: config.name,
        cloudMapNamespace: namespace,
        dnsRecordType: servicediscovery.DnsRecordType.A,
      },
    });

    const scaling = fargateService.autoScaleTaskCount({ minCapacity: 1, maxCapacity: 2 });
    scaling.scaleOnCpuUtilization(`${config.name}CpuScaling`, {
      targetUtilizationPercent: 70,
      scaleInCooldown: cdk.Duration.seconds(60),
      scaleOutCooldown: cdk.Duration.seconds(60),
    });

    return fargateService;
  }
}
