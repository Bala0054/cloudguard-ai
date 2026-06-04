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

    new cdk.CfnOutput(this, 'TableName', { value: cloudguardTable.tableName });
    new cdk.CfnOutput(this, 'UserPoolId', { value: userPool.userPoolId });
    new cdk.CfnOutput(this, 'UserPoolClientId', { value: userPoolClient.userPoolClientId });
    new cdk.CfnOutput(this, 'ApiUrl', { value: api.url });
  }
}