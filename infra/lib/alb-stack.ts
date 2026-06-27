import * as cdk from 'aws-cdk-lib';
import * as ec2 from 'aws-cdk-lib/aws-ec2';
import * as ecs from 'aws-cdk-lib/aws-ecs';
import * as elbv2 from 'aws-cdk-lib/aws-elasticloadbalancingv2';
import * as s3 from 'aws-cdk-lib/aws-s3';
import * as wafv2 from 'aws-cdk-lib/aws-wafv2';
import * as acm from 'aws-cdk-lib/aws-certificatemanager';
import { Construct } from 'constructs';

export interface AlbConstructProps {
  readonly vpc: ec2.Vpc;
  readonly securityGroup: ec2.SecurityGroup;
  readonly services: Record<string, ecs.FargateService>;
  /** Optional ACM certificate ARN. If provided, an HTTPS:443 listener is added with HTTP→HTTPS redirect. */
  readonly certificateArn?: string;
}

interface RouteConfig {
  pathPattern: string;
  priority: number;
  serviceName: string;
  port: number;
}

const ROUTE_CONFIGS: RouteConfig[] = [
  { pathPattern: '/api/v1/auth/*', priority: 10, serviceName: 'auth', port: 8001 },
  { pathPattern: '/api/v1/users*', priority: 11, serviceName: 'auth', port: 8001 },
  { pathPattern: '/api/v1/customers/*', priority: 20, serviceName: 'customer', port: 8002 },
  { pathPattern: '/api/v1/kyc/*', priority: 21, serviceName: 'customer', port: 8002 },
  { pathPattern: '/api/v1/loan-products*', priority: 30, serviceName: 'loan', port: 8003 },
  { pathPattern: '/api/v1/applications*', priority: 31, serviceName: 'loan', port: 8003 },
  { pathPattern: '/api/v1/eligibility/*', priority: 32, serviceName: 'loan', port: 8003 },
  { pathPattern: '/api/v1/underwriting/*', priority: 40, serviceName: 'underwriting', port: 8004 },
  { pathPattern: '/api/v1/disbursements/*', priority: 50, serviceName: 'disbursement', port: 8005 },
  { pathPattern: '/api/v1/loans*', priority: 51, serviceName: 'disbursement', port: 8005 },
  { pathPattern: '/api/v1/repayments/*', priority: 60, serviceName: 'repayment', port: 8006 },
  { pathPattern: '/api/v1/collections*', priority: 70, serviceName: 'collections', port: 8007 },
  { pathPattern: '/api/v1/notifications/*', priority: 80, serviceName: 'notification', port: 8008 },
  { pathPattern: '/api/v1/audit/*', priority: 90, serviceName: 'audit', port: 8009 },
  { pathPattern: '/api/v1/dashboard/*', priority: 100, serviceName: 'dashboard', port: 8010 },
];

export class AlbConstruct extends Construct {
  public readonly alb: elbv2.ApplicationLoadBalancer;
  public readonly listener: elbv2.ApplicationListener;
  public readonly dnsName: string;

  constructor(scope: Construct, id: string, props: AlbConstructProps) {
    super(scope, id);

    // S3 bucket for ALB access logs (workshop note: short retention to control cost)
    const logBucket = new s3.Bucket(this, 'AlbAccessLogs', {
      blockPublicAccess: s3.BlockPublicAccess.BLOCK_ALL,
      encryption: s3.BucketEncryption.S3_MANAGED,
      enforceSSL: true,
      lifecycleRules: [{ expiration: cdk.Duration.days(30) }],
      removalPolicy: cdk.RemovalPolicy.DESTROY,
      autoDeleteObjects: true,
    });

    this.alb = new elbv2.ApplicationLoadBalancer(this, 'LoanAlb', {
      vpc: props.vpc,
      internetFacing: true,
      securityGroup: props.securityGroup,
      loadBalancerName: 'loan-mgmt-alb',
      dropInvalidHeaderFields: true,
    });
    this.alb.logAccessLogs(logBucket, 'alb');

    // ---- Listeners ----
    let primaryListener: elbv2.ApplicationListener;
    if (props.certificateArn) {
      // HTTPS listener with HTTP→HTTPS redirect on :80
      const certificate = acm.Certificate.fromCertificateArn(this, 'AlbCert', props.certificateArn);

      this.alb.addListener('HttpRedirect', {
        port: 80,
        protocol: elbv2.ApplicationProtocol.HTTP,
        defaultAction: elbv2.ListenerAction.redirect({
          protocol: 'HTTPS',
          port: '443',
          permanent: true,
        }),
      });

      primaryListener = this.alb.addListener('HttpsListener', {
        port: 443,
        protocol: elbv2.ApplicationProtocol.HTTPS,
        certificates: [certificate],
        sslPolicy: elbv2.SslPolicy.TLS13_RES,
        defaultAction: elbv2.ListenerAction.fixedResponse(404, {
          contentType: 'application/json',
          messageBody: JSON.stringify({ error: 'Not Found' }),
        }),
      });
    } else {
      // Workshop default: HTTP-only listener fronted by CloudFront (HTTPS at the edge).
      primaryListener = this.alb.addListener('HttpListener', {
        port: 80,
        protocol: elbv2.ApplicationProtocol.HTTP,
        defaultAction: elbv2.ListenerAction.fixedResponse(404, {
          contentType: 'application/json',
          messageBody: JSON.stringify({ error: 'Not Found' }),
        }),
      });
    }
    this.listener = primaryListener;

    // ---- Target groups + path routing ----
    const targetGroups: Record<string, elbv2.ApplicationTargetGroup> = {};
    for (const route of ROUTE_CONFIGS) {
      if (!targetGroups[route.serviceName]) {
        targetGroups[route.serviceName] = new elbv2.ApplicationTargetGroup(
          this,
          `${route.serviceName}Tg`,
          {
            vpc: props.vpc,
            port: route.port,
            protocol: elbv2.ApplicationProtocol.HTTP,
            targetType: elbv2.TargetType.IP,
            healthCheck: {
              path: '/health',
              port: route.port.toString(),
              healthyHttpCodes: '200',
              interval: cdk.Duration.seconds(30),
              timeout: cdk.Duration.seconds(5),
              healthyThresholdCount: 2,
              unhealthyThresholdCount: 3,
            },
            targetGroupName: `loan-${route.serviceName}-tg`,
          }
        );

        const service = props.services[route.serviceName];
        if (service) {
          service.attachToApplicationTargetGroup(targetGroups[route.serviceName]);
        }
      }

      this.listener.addAction(`${route.serviceName}Route${route.priority}`, {
        priority: route.priority,
        conditions: [elbv2.ListenerCondition.pathPatterns([route.pathPattern])],
        action: elbv2.ListenerAction.forward([targetGroups[route.serviceName]]),
      });
    }

    // ---- No frontend default target group ----
    // The React SPA is served by CloudFront from S3 (FrontendConstruct), not
    // by an ECS service behind the ALB. CloudFront forwards `/api/*` to this
    // ALB; everything else is served from S3 with OAC. The ALB's default
    // action is the 404 set on the listener above.

    // ---- WAF (regional, attached to ALB) ----
    const webAcl = new wafv2.CfnWebACL(this, 'AlbWebAcl', {
      name: 'loan-mgmt-alb-acl',
      scope: 'REGIONAL',
      defaultAction: { allow: {} },
      visibilityConfig: {
        cloudWatchMetricsEnabled: true,
        metricName: 'loan-mgmt-alb-acl',
        sampledRequestsEnabled: true,
      },
      rules: [
        {
          name: 'AWS-AWSManagedRulesCommonRuleSet',
          priority: 0,
          overrideAction: { none: {} },
          statement: {
            managedRuleGroupStatement: {
              vendorName: 'AWS',
              name: 'AWSManagedRulesCommonRuleSet',
            },
          },
          visibilityConfig: {
            cloudWatchMetricsEnabled: true,
            metricName: 'common-rule-set',
            sampledRequestsEnabled: true,
          },
        },
        {
          name: 'AWS-AWSManagedRulesKnownBadInputsRuleSet',
          priority: 1,
          overrideAction: { none: {} },
          statement: {
            managedRuleGroupStatement: {
              vendorName: 'AWS',
              name: 'AWSManagedRulesKnownBadInputsRuleSet',
            },
          },
          visibilityConfig: {
            cloudWatchMetricsEnabled: true,
            metricName: 'known-bad-inputs',
            sampledRequestsEnabled: true,
          },
        },
        {
          name: 'RateLimitPerIp',
          priority: 2,
          action: { block: {} },
          statement: {
            rateBasedStatement: {
              limit: 2000, // requests per 5-minute window per source IP
              aggregateKeyType: 'IP',
            },
          },
          visibilityConfig: {
            cloudWatchMetricsEnabled: true,
            metricName: 'rate-limit-per-ip',
            sampledRequestsEnabled: true,
          },
        },
      ],
    });

    new wafv2.CfnWebACLAssociation(this, 'AlbWebAclAssoc', {
      resourceArn: this.alb.loadBalancerArn,
      webAclArn: webAcl.attrArn,
    });

    this.dnsName = this.alb.loadBalancerDnsName;
    cdk.Tags.of(this).add('Project', 'LoanManagementSystem');
  }
}
