#!/usr/bin/env node
import 'source-map-support/register';
import * as cdk from 'aws-cdk-lib';
import { MainStack } from '../lib/main-stack';

const app = new cdk.App();

// Account/region MUST come from environment. Workshop Studio injects
// CDK_DEFAULT_ACCOUNT/CDK_DEFAULT_REGION into the participant's environment;
// for local development you can `aws configure` or `export CDK_DEFAULT_*`.
const account = process.env.CDK_DEFAULT_ACCOUNT;
const region = process.env.CDK_DEFAULT_REGION ?? 'us-east-1';

if (!account) {
  throw new Error(
    'CDK_DEFAULT_ACCOUNT is not set. Run `aws sts get-caller-identity` to ' +
    'verify your credentials, or `export CDK_DEFAULT_ACCOUNT=<your-account-id>`.'
  );
}

// Workshop participants can override the stack name with `-c stackName=...`
// to deploy multiple isolated copies in the same account.
const stackName =
  (app.node.tryGetContext('stackName') as string | undefined) ??
  process.env.STACK_NAME ??
  'LoanManagementSystem';

new MainStack(app, stackName, {
  env: { account, region },
  description: 'Loan Management System — workshop sample (AWS GitHub samples)',
  tags: {
    Project: stackName,
    Environment: process.env.ENVIRONMENT ?? 'Workshop',
  },
});

app.synth();
