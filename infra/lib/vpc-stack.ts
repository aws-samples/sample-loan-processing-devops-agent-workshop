import * as cdk from 'aws-cdk-lib';
import * as ec2 from 'aws-cdk-lib/aws-ec2';
import { Construct } from 'constructs';

export interface VpcConstructProps {
  readonly maxAzs?: number;
}

export class VpcConstruct extends Construct {
  public readonly vpc: ec2.Vpc;
  public readonly albSecurityGroup: ec2.SecurityGroup;
  public readonly ecsSecurityGroup: ec2.SecurityGroup;
  public readonly rdsSecurityGroup: ec2.SecurityGroup;
  public readonly redisSecurityGroup: ec2.SecurityGroup;

  constructor(scope: Construct, id: string, props?: VpcConstructProps) {
    super(scope, id);

    // VPC with public and private subnets across 2 AZs
    this.vpc = new ec2.Vpc(this, 'LoanVpc', {
      maxAzs: props?.maxAzs ?? 2,
      natGateways: 1,
      subnetConfiguration: [
        {
          cidrMask: 24,
          name: 'Public',
          subnetType: ec2.SubnetType.PUBLIC,
        },
        {
          cidrMask: 24,
          name: 'Private',
          subnetType: ec2.SubnetType.PRIVATE_WITH_EGRESS,
        },
      ],
    });

    // Security Group: ALB (public-facing)
    this.albSecurityGroup = new ec2.SecurityGroup(this, 'AlbSg', {
      vpc: this.vpc,
      description: 'Security group for Application Load Balancer',
      allowAllOutbound: true,
    });
    this.albSecurityGroup.addIngressRule(
      ec2.Peer.anyIpv4(),
      ec2.Port.tcp(80),
      'Allow HTTP from anywhere'
    );
    this.albSecurityGroup.addIngressRule(
      ec2.Peer.anyIpv4(),
      ec2.Port.tcp(443),
      'Allow HTTPS from anywhere'
    );

    // Security Group: ECS Tasks
    this.ecsSecurityGroup = new ec2.SecurityGroup(this, 'EcsSg', {
      vpc: this.vpc,
      description: 'Security group for ECS Fargate tasks',
      allowAllOutbound: true,
    });
    this.ecsSecurityGroup.addIngressRule(
      this.albSecurityGroup,
      ec2.Port.tcpRange(8001, 8010),
      'Allow traffic from ALB to service ports'
    );
    // Allow inter-service communication
    this.ecsSecurityGroup.addIngressRule(
      this.ecsSecurityGroup,
      ec2.Port.tcpRange(8001, 8010),
      'Allow inter-service communication'
    );

    // Security Group: RDS
    this.rdsSecurityGroup = new ec2.SecurityGroup(this, 'RdsSg', {
      vpc: this.vpc,
      description: 'Security group for RDS PostgreSQL',
      allowAllOutbound: false,
    });
    this.rdsSecurityGroup.addIngressRule(
      this.ecsSecurityGroup,
      ec2.Port.tcp(5432),
      'Allow PostgreSQL access from ECS tasks'
    );

    // Security Group: Redis
    this.redisSecurityGroup = new ec2.SecurityGroup(this, 'RedisSg', {
      vpc: this.vpc,
      description: 'Security group for ElastiCache Redis',
      allowAllOutbound: false,
    });
    this.redisSecurityGroup.addIngressRule(
      this.ecsSecurityGroup,
      ec2.Port.tcp(6379),
      'Allow Redis access from ECS tasks'
    );

    // Tags
    cdk.Tags.of(this).add('Project', 'LoanManagementSystem');
    cdk.Tags.of(this).add('Environment', 'Demo');
  }
}
