import * as cdk from 'aws-cdk-lib';
import * as s3 from 'aws-cdk-lib/aws-s3';
import * as cloudfront from 'aws-cdk-lib/aws-cloudfront';
import * as origins from 'aws-cdk-lib/aws-cloudfront-origins';
import * as elbv2 from 'aws-cdk-lib/aws-elasticloadbalancingv2';
import { Construct } from 'constructs';

export interface FrontendConstructProps {
  readonly alb: elbv2.ApplicationLoadBalancer;
}

export class FrontendConstruct extends Construct {
  public readonly bucket: s3.Bucket;
  public readonly distribution: cloudfront.Distribution;
  public readonly distributionUrl: string;

  constructor(scope: Construct, id: string, props: FrontendConstructProps) {
    super(scope, id);

    // S3 bucket for static frontend assets
    this.bucket = new s3.Bucket(this, 'FrontendBucket', {
      bucketName: undefined, // Auto-generated unique name
      blockPublicAccess: s3.BlockPublicAccess.BLOCK_ALL,
      removalPolicy: cdk.RemovalPolicy.DESTROY,
      autoDeleteObjects: true,
      encryption: s3.BucketEncryption.S3_MANAGED,
    });

    // S3 bucket origin with Origin Access Control (OAC)
    const s3Origin = origins.S3BucketOrigin.withOriginAccessControl(this.bucket);

    // ALB origin for API pass-through
    const albOrigin = new origins.HttpOrigin(props.alb.loadBalancerDnsName, {
      protocolPolicy: cloudfront.OriginProtocolPolicy.HTTP_ONLY,
      httpPort: 80,
    });

    // CloudFront distribution
    this.distribution = new cloudfront.Distribution(this, 'FrontendDistribution', {
      comment: 'Loan Management System Frontend',
      defaultRootObject: 'index.html',
      defaultBehavior: {
        origin: s3Origin,
        viewerProtocolPolicy: cloudfront.ViewerProtocolPolicy.REDIRECT_TO_HTTPS,
        cachePolicy: cloudfront.CachePolicy.CACHING_OPTIMIZED,
        allowedMethods: cloudfront.AllowedMethods.ALLOW_GET_HEAD,
      },
      additionalBehaviors: {
        '/api/*': {
          origin: albOrigin,
          viewerProtocolPolicy: cloudfront.ViewerProtocolPolicy.REDIRECT_TO_HTTPS,
          cachePolicy: cloudfront.CachePolicy.CACHING_DISABLED,
          originRequestPolicy: cloudfront.OriginRequestPolicy.ALL_VIEWER,
          allowedMethods: cloudfront.AllowedMethods.ALLOW_ALL,
        },
      },
      // SPA routing: serve index.html for 403/404 errors (client-side routing)
      errorResponses: [
        {
          httpStatus: 403,
          responseHttpStatus: 200,
          responsePagePath: '/index.html',
          ttl: cdk.Duration.seconds(0),
        },
        {
          httpStatus: 404,
          responseHttpStatus: 200,
          responsePagePath: '/index.html',
          ttl: cdk.Duration.seconds(0),
        },
      ],
    });

    this.distributionUrl = `https://${this.distribution.distributionDomainName}`;

    // Tags
    cdk.Tags.of(this).add('Project', 'LoanManagementSystem');
    cdk.Tags.of(this).add('Environment', 'Demo');
  }
}
