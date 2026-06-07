import * as s3 from 'aws-cdk-lib/aws-s3';
import * as cloudfront from 'aws-cdk-lib/aws-cloudfront';
import * as origins from 'aws-cdk-lib/aws-cloudfront-origins';
import * as s3deploy from 'aws-cdk-lib/aws-s3-deployment';
import * as cdk from 'aws-cdk-lib';
import * as dynamodb from 'aws-cdk-lib/aws-dynamodb';
import * as cognito from 'aws-cdk-lib/aws-cognito';
import * as lambda from 'aws-cdk-lib/aws-lambda';
import * as apigateway from 'aws-cdk-lib/aws-apigateway';
import * as iam from 'aws-cdk-lib/aws-iam';
import * as path from 'path';
import { Construct } from 'constructs';

export class InfrastructureStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props?: cdk.StackProps) {
    super(scope, id, props);

    const cloudguardTable = new dynamodb.Table(this, 'CloudGuardTable', {
      tableName: 'cloudguard-main',
      partitionKey: { name: 'tenantId', type: dynamodb.AttributeType.STRING },
      sortKey: { name: 'recordId', type: dynamodb.AttributeType.STRING },
      billingMode: dynamodb.BillingMode.PAY_PER_REQUEST,
      removalPolicy: cdk.RemovalPolicy.DESTROY,
    });

    const userPool = new cognito.UserPool(this, 'CloudGuardUserPool', {
      userPoolName: 'cloudguard-users',
      selfSignUpEnabled: true,
      signInAliases: { email: true },
      autoVerify: { email: true },
      passwordPolicy: { minLength: 8, requireUppercase: true, requireDigits: true, requireSymbols: false },
      removalPolicy: cdk.RemovalPolicy.DESTROY,
    });

    const userPoolClient = new cognito.UserPoolClient(this, 'CloudGuardClient', {
      userPool,
      userPoolClientName: 'cloudguard-web-client',
      authFlows: { userPassword: true, userSrp: true },
    });

    const costHandler = new lambda.Function(this, 'CostHandler', {
      functionName: 'cloudguard-cost-handler',
      runtime: lambda.Runtime.NODEJS_20_X,
      handler: 'index.handler',
      code: lambda.Code.fromAsset(path.join(__dirname, '../../backend/cost-handler')),
      timeout: cdk.Duration.seconds(30),
    });

    costHandler.addToRolePolicy(new iam.PolicyStatement({
      actions: ['ce:GetCostAndUsage'],
      resources: ['*'],
    }));
    cloudguardTable.grantReadWriteData(costHandler);

    const api = new apigateway.RestApi(this, 'CloudGuardApi', {
      restApiName: 'cloudguard-api',
      defaultCorsPreflightOptions: {
        allowOrigins: apigateway.Cors.ALL_ORIGINS,
        allowMethods: apigateway.Cors.ALL_METHODS,
      },
    });

    // Costs endpoint
    const costs = api.root.addResource('costs');
    costs.addMethod('GET', new apigateway.LambdaIntegration(costHandler));

    // Anomaly Detector Lambda
    const anomalyDetector = new lambda.Function(this, 'AnomalyDetector', {
      runtime: lambda.Runtime.NODEJS_18_X,
      handler: 'index.handler',
      code: lambda.Code.fromAsset('../backend/anomaly-detector'),
      timeout: cdk.Duration.seconds(30),
    });
    const anomalies = api.root.addResource('anomalies');
    anomalies.addMethod('GET', new apigateway.LambdaIntegration(anomalyDetector));

    // Security Scanner Lambda
    const securityScanner = new lambda.Function(this, 'SecurityScanner', {
      runtime: lambda.Runtime.NODEJS_18_X,
      handler: 'index.handler',
      code: lambda.Code.fromAsset('../backend/security-scanner'),
      timeout: cdk.Duration.seconds(30),
    });
    const security = api.root.addResource('security');
    security.addMethod('GET', new apigateway.LambdaIntegration(securityScanner));

    // ── Phase 8: Accounts Handler Lambda ──────────────────────────────────────
    const accountsHandler = new lambda.Function(this, 'AccountsHandler', {
      runtime: lambda.Runtime.NODEJS_18_X,
      handler: 'index.handler',
      code: lambda.Code.fromAsset('../backend/accounts-handler'),
      timeout: cdk.Duration.seconds(30),
    });

    // Allow this Lambda to call STS AssumeRole on any role
    accountsHandler.addToRolePolicy(new iam.PolicyStatement({
      actions: ['sts:AssumeRole'],
      resources: ['*'],
    }));

    // Allow this Lambda to read/write DynamoDB
    cloudguardTable.grantReadWriteData(accountsHandler);

    // POST /accounts route
    const accounts = api.root.addResource('accounts');
    accounts.addMethod('POST', new apigateway.LambdaIntegration(accountsHandler));
    // ─────────────────────────────────────────────────────────────────────────

    // S3 + CloudFront for frontend
    const siteBucket = new s3.Bucket(this, 'SiteBucket', {
      removalPolicy: cdk.RemovalPolicy.DESTROY,
      autoDeleteObjects: true,
    });

    const apiOrigin = new origins.HttpOrigin(
      `${api.restApiId}.execute-api.ap-south-1.amazonaws.com`,
      { originPath: '/prod' }
    );

    const distribution = new cloudfront.Distribution(this, 'SiteDistribution', {
      defaultBehavior: {
        origin: origins.S3BucketOrigin.withOriginAccessControl(siteBucket),
      },
      additionalBehaviors: {
        '/api/*': {
          origin: apiOrigin,
          allowedMethods: cloudfront.AllowedMethods.ALLOW_ALL,
          cachePolicy: cloudfront.CachePolicy.CACHING_DISABLED,
          originRequestPolicy: cloudfront.OriginRequestPolicy.ALL_VIEWER_EXCEPT_HOST_HEADER,
        },
      },
      defaultRootObject: 'index.html',
      errorResponses: [{ httpStatus: 404, responseHttpStatus: 200, responsePagePath: '/index.html' }],
    });

    new s3deploy.BucketDeployment(this, 'DeploySite', {
      sources: [s3deploy.Source.asset('../frontend/dashboard/dist')],
      destinationBucket: siteBucket,
      distribution,
      distributionPaths: ['/*'],
    });

    new cdk.CfnOutput(this, 'CloudFrontURL', { value: `https://${distribution.distributionDomainName}` });
    new cdk.CfnOutput(this, 'TableName', { value: cloudguardTable.tableName });
    new cdk.CfnOutput(this, 'UserPoolId', { value: userPool.userPoolId });
    new cdk.CfnOutput(this, 'UserPoolClientId', { value: userPoolClient.userPoolClientId });
    new cdk.CfnOutput(this, 'ApiUrl', { value: api.url });
  }
}
