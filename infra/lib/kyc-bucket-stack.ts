import * as cdk from 'aws-cdk-lib';
import * as s3 from 'aws-cdk-lib/aws-s3';
import { Construct } from 'constructs';

/**
 * S3 bucket for tamper-evident KYC documents written by the audit-service.
 *
 * In real banking systems, a KYC submission for a customer (driving licence
 * scan, address proof, etc.) is persisted alongside the audit record so the
 * audit trail can be reproduced under regulatory subpoena. The workshop
 * sample mimics this with a minimal S3 PutObject every time the audit-service
 * receives a `KYC_DOCUMENT_UPLOADED` event.
 *
 * The bucket is:
 *   - block-public-access ALL
 *   - SSE-S3 encrypted
 *   - enforce-SSL via bucket policy
 *   - 365-day retention with auto-delete on stack tear-down (workshop)
 *
 * Lab 2 (`demo/lab2-iam-s3-deny`) revokes the audit-service task role's
 * `s3:PutObject` on this bucket to simulate an inadvertent IAM tightening
 * that breaks downstream KYC archival.
 */
export class KycBucketConstruct extends Construct {
  public readonly bucket: s3.Bucket;

  constructor(scope: Construct, id: string) {
    super(scope, id);

    this.bucket = new s3.Bucket(this, 'Bucket', {
      blockPublicAccess: s3.BlockPublicAccess.BLOCK_ALL,
      encryption: s3.BucketEncryption.S3_MANAGED,
      enforceSSL: true,
      versioned: true,
      lifecycleRules: [{ expiration: cdk.Duration.days(365) }],
      removalPolicy: cdk.RemovalPolicy.DESTROY,
      autoDeleteObjects: true,
    });

    cdk.Tags.of(this).add('Project', 'LoanManagementSystem');

    new cdk.CfnOutput(this, 'KycBucketName', {
      value: this.bucket.bucketName,
      exportName: 'LoanMgmt-KycBucket',
    });
  }
}
