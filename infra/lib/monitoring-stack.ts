import * as cdk from 'aws-cdk-lib';
import * as path from 'path';
import { Construct } from 'constructs';
import * as cloudwatch from 'aws-cdk-lib/aws-cloudwatch';
import * as cwActions from 'aws-cdk-lib/aws-cloudwatch-actions';
import * as iam from 'aws-cdk-lib/aws-iam';
import * as lambda from 'aws-cdk-lib/aws-lambda';
import * as logs from 'aws-cdk-lib/aws-logs';
import * as rds from 'aws-cdk-lib/aws-rds';
import * as secretsmanager from 'aws-cdk-lib/aws-secretsmanager';
import * as sns from 'aws-cdk-lib/aws-sns';
import * as snsSubs from 'aws-cdk-lib/aws-sns-subscriptions';
import * as elbv2 from 'aws-cdk-lib/aws-elasticloadbalancingv2';
import * as ecs from 'aws-cdk-lib/aws-ecs';

export interface MonitoringConstructProps {
  /** Name of the ECS cluster (used to scope ECS-dimension alarms). */
  readonly clusterName: string;
  /** ECS Fargate services to alarm on. */
  readonly services: Record<string, ecs.FargateService>;
  /** RDS instance for the data-tier alarms (Lab 1). */
  readonly database: rds.DatabaseInstance;
  /** ALB whose 5xx + UnHealthyHostCount we alarm on (Lab 3). */
  readonly alb: elbv2.IApplicationLoadBalancer;
  /**
   * DevOps Agent webhook URL. Plain configuration value — empty string when
   * unconfigured (then the Lambda short-circuits without a network call).
   */
  readonly devopsAgentWebhookUrl?: string;
  /**
   * DevOps Agent webhook HMAC shared secret. If supplied, the construct
   * provisions a Secrets Manager secret and the Lambda fetches it at
   * invocation time. If empty, no Secrets Manager resource is created.
   */
  readonly devopsAgentWebhookSecret?: string;
}

/**
 * Operational telemetry construct.
 *
 * Provisions:
 *   - SNS topic with all ALARM-state actions wired in
 *   - CloudWatch alarms on ECS NoRunningTasks, ALB 5xx + UnHealthy hosts, and
 *     RDS DatabaseConnections (which is what powers Lab 1 — RDS pool exhaustion)
 *   - Webhook Lambda function that signs payloads with HMAC-SHA256 and POSTs
 *     them to the AWS DevOps Agent endpoint configured by the deployer
 *   - AWS Secrets Manager secret for the HMAC shared secret (only when
 *     supplied via CDK context)
 *
 * The webhook Lambda's IAM permissions are scoped to:
 *   - read the single Secrets Manager ARN it's been given (when configured)
 *   - call cloudwatch:DescribeAlarms / DescribeAlarmHistory
 *
 * No Bedrock, GenAI, or other broad service grants. No wildcards beyond the
 * narrow CloudWatch read-only scope above.
 */
export class MonitoringConstruct extends Construct {
  public readonly alarmTopic: sns.Topic;
  public readonly webhookLambda: lambda.Function;
  public readonly webhookSecret?: secretsmanager.Secret;

  constructor(scope: Construct, id: string, props: MonitoringConstructProps) {
    super(scope, id);

    // -------------------------------------------------------------------------
    // SNS topic
    // -------------------------------------------------------------------------
    this.alarmTopic = new sns.Topic(this, 'AlarmTopic', {
      topicName: 'LoanMgmt-Alarms',
      displayName: 'LoanMgmt CloudWatch Alarms',
    });

    // -------------------------------------------------------------------------
    // Webhook secret (only if a shared secret was supplied)
    // -------------------------------------------------------------------------
    let webhookSecretArn = '';
    if (props.devopsAgentWebhookSecret) {
      this.webhookSecret = new secretsmanager.Secret(this, 'WebhookSecret', {
        secretName: 'loan-management/devops-agent-webhook-secret',
        description: 'HMAC-SHA256 shared secret for AWS DevOps Agent webhook signing.',
        secretStringValue: cdk.SecretValue.unsafePlainText(props.devopsAgentWebhookSecret),
        removalPolicy: cdk.RemovalPolicy.DESTROY,
      });
      webhookSecretArn = this.webhookSecret.secretArn;
    }

    // -------------------------------------------------------------------------
    // Webhook Lambda
    // -------------------------------------------------------------------------
    this.webhookLambda = new lambda.Function(this, 'WebhookFn', {
      functionName: 'LoanMgmt-DevOpsAgent-Webhook',
      description: 'Forwards CloudWatch alarms to AWS DevOps Agent for auto-investigation.',
      runtime: lambda.Runtime.PYTHON_3_12,
      handler: 'devops_agent_webhook.lambda_handler',
      code: lambda.Code.fromAsset(path.join(__dirname, '..', 'lambda')),
      timeout: cdk.Duration.seconds(30),
      memorySize: 128,
      environment: {
        WEBHOOK_URL: props.devopsAgentWebhookUrl ?? '',
        WEBHOOK_SECRET_ARN: webhookSecretArn,
      },
      logGroup: new logs.LogGroup(this, 'WebhookFnLogs', {
        logGroupName: '/aws/lambda/LoanMgmt-DevOpsAgent-Webhook',
        retention: logs.RetentionDays.ONE_WEEK,
        removalPolicy: cdk.RemovalPolicy.DESTROY,
      }),
    });

    // CloudWatch read-only for the alarm metadata (description, history).
    this.webhookLambda.addToRolePolicy(
      new iam.PolicyStatement({
        actions: ['cloudwatch:DescribeAlarms', 'cloudwatch:DescribeAlarmHistory'],
        resources: ['*'],
      })
    );

    // Single-ARN Secrets Manager grant when configured.
    if (this.webhookSecret) {
      this.webhookSecret.grantRead(this.webhookLambda);
    }

    // SNS → Lambda subscription (the SNS topic is the alarm action target).
    this.alarmTopic.addSubscription(new snsSubs.LambdaSubscription(this.webhookLambda));

    // -------------------------------------------------------------------------
    // ECS NoRunningTasks alarms (per service) — Lab 3 health-check drift fires this
    // -------------------------------------------------------------------------
    for (const [name, service] of Object.entries(props.services)) {
      void service; // service binding is unused; the alarm is keyed on cluster + service-name dimensions
      new cloudwatch.Alarm(this, `${name}NoRunningTasksAlarm`, {
        alarmName: `LoanMgmt-${name}-NoRunningTasks`,
        alarmDescription: `${name}-service has 0 running tasks`,
        metric: new cloudwatch.Metric({
          namespace: 'ECS/ContainerInsights',
          metricName: 'RunningTaskCount',
          dimensionsMap: {
            ClusterName: props.clusterName,
            ServiceName: `${name}-service`,
          },
          statistic: 'Average',
          period: cdk.Duration.minutes(1),
        }),
        threshold: 1,
        evaluationPeriods: 2,
        comparisonOperator: cloudwatch.ComparisonOperator.LESS_THAN_THRESHOLD,
        treatMissingData: cloudwatch.TreatMissingData.NOT_BREACHING,
      }).addAlarmAction(new cwActions.SnsAction(this.alarmTopic));
    }

    // -------------------------------------------------------------------------
    // ALB alarms — Lab 3 fails ALB target health checks for disbursement-service
    // -------------------------------------------------------------------------
    new cloudwatch.Alarm(this, 'Alb5xxAlarm', {
      alarmName: 'LoanMgmt-ALB-High5xxErrors',
      alarmDescription: 'ALB returning > 5 HTTP 5xx per minute',
      metric: new cloudwatch.Metric({
        namespace: 'AWS/ApplicationELB',
        metricName: 'HTTPCode_Target_5XX_Count',
        dimensionsMap: { LoadBalancer: (props.alb as elbv2.ApplicationLoadBalancer).loadBalancerFullName },
        statistic: 'Sum',
        period: cdk.Duration.minutes(1),
      }),
      threshold: 5,
      evaluationPeriods: 1,
      comparisonOperator: cloudwatch.ComparisonOperator.GREATER_THAN_THRESHOLD,
      treatMissingData: cloudwatch.TreatMissingData.NOT_BREACHING,
    }).addAlarmAction(new cwActions.SnsAction(this.alarmTopic));

    new cloudwatch.Alarm(this, 'AlbUnhealthyHostsAlarm', {
      alarmName: 'LoanMgmt-ALB-UnhealthyHosts',
      alarmDescription: 'ALB has at least one unhealthy target for 2 consecutive minutes',
      metric: new cloudwatch.Metric({
        namespace: 'AWS/ApplicationELB',
        metricName: 'UnHealthyHostCount',
        dimensionsMap: { LoadBalancer: (props.alb as elbv2.ApplicationLoadBalancer).loadBalancerFullName },
        statistic: 'Maximum',
        period: cdk.Duration.minutes(1),
      }),
      threshold: 1,
      evaluationPeriods: 2,
      comparisonOperator: cloudwatch.ComparisonOperator.GREATER_THAN_OR_EQUAL_TO_THRESHOLD,
      treatMissingData: cloudwatch.TreatMissingData.NOT_BREACHING,
    }).addAlarmAction(new cwActions.SnsAction(this.alarmTopic));

    // -------------------------------------------------------------------------
    // RDS alarms — Lab 1 (RDS connection pool exhaustion) fires this
    // -------------------------------------------------------------------------
    new cloudwatch.Alarm(this, 'RdsConnectionsAlarm', {
      alarmName: 'LoanMgmt-RDS-HighConnections',
      alarmDescription: 'RDS DatabaseConnections > 80 (pool saturating)',
      metric: new cloudwatch.Metric({
        namespace: 'AWS/RDS',
        metricName: 'DatabaseConnections',
        dimensionsMap: { DBInstanceIdentifier: props.database.instanceIdentifier },
        statistic: 'Maximum',
        period: cdk.Duration.minutes(1),
      }),
      threshold: 80,
      evaluationPeriods: 1,
      comparisonOperator: cloudwatch.ComparisonOperator.GREATER_THAN_THRESHOLD,
      treatMissingData: cloudwatch.TreatMissingData.NOT_BREACHING,
    }).addAlarmAction(new cwActions.SnsAction(this.alarmTopic));

    new cloudwatch.Alarm(this, 'RdsCpuAlarm', {
      alarmName: 'LoanMgmt-RDS-HighCPU',
      alarmDescription: 'RDS CPU > 80%',
      metric: new cloudwatch.Metric({
        namespace: 'AWS/RDS',
        metricName: 'CPUUtilization',
        dimensionsMap: { DBInstanceIdentifier: props.database.instanceIdentifier },
        statistic: 'Average',
        period: cdk.Duration.minutes(1),
      }),
      threshold: 80,
      evaluationPeriods: 2,
      comparisonOperator: cloudwatch.ComparisonOperator.GREATER_THAN_THRESHOLD,
      treatMissingData: cloudwatch.TreatMissingData.NOT_BREACHING,
    }).addAlarmAction(new cwActions.SnsAction(this.alarmTopic));

    cdk.Tags.of(this).add('Project', 'LoanManagementSystem');

    // -------------------------------------------------------------------------
    // Outputs
    // -------------------------------------------------------------------------
    new cdk.CfnOutput(this, 'AlarmTopicArn', { value: this.alarmTopic.topicArn });
    new cdk.CfnOutput(this, 'WebhookFunctionName', { value: this.webhookLambda.functionName });
  }
}
