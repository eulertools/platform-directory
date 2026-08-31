import { Duration, StackProps, RemovalPolicy } from "aws-cdk-lib";
import { Construct } from "constructs";
import {
  AuthorizationType,
  CognitoUserPoolsAuthorizer,
  LambdaIntegration,
  Resource,
} from "aws-cdk-lib/aws-apigateway";
import * as path from "path";
import * as lambda from "aws-cdk-lib/aws-lambda";
import * as dynamodb from "aws-cdk-lib/aws-dynamodb";
import * as iam from "aws-cdk-lib/aws-iam";
import { ICertificate } from "aws-cdk-lib/aws-certificatemanager";
import * as cognito from "aws-cdk-lib/aws-cognito";

interface AppStackProps extends StackProps {
  hostedZone: string;
  userPool: cognito.UserPool;
  tableName: string;
  certificate: ICertificate;
  api: Resource;
  authorizer: CognitoUserPoolsAuthorizer;
}

export class PlatformDirectoryAlertsApiStack extends Construct {
  constructor(scope: Construct, id: string, props?: AppStackProps) {
    super(scope, id);

    const {api, authorizer, tableName} = props!;

    const alertsTable = new dynamodb.Table(this, "Alerts", {
      removalPolicy: RemovalPolicy.DESTROY,
      partitionKey: {
        name: "address",
        type: dynamodb.AttributeType.STRING,
      },
      sortKey: {
        name: "chain_id",
        type: dynamodb.AttributeType.STRING,
      },
      billingMode: dynamodb.BillingMode.PROVISIONED,
    });

    const apiDynamodbAlertsHandler = new lambda.Function(
      this,
      "alerts-dynamodb-api-handler",
      {
        functionName: "alerts-dynamodb-api-handler",
        handler: "index.handler",
        description:
          "Create alerts system api that retrieves records from dynamodb",
        code: lambda.Code.fromAsset(path.join(__dirname, `/../../src/alerts-handler`)),
        runtime: lambda.Runtime.NODEJS_18_X,
        timeout: Duration.minutes(1),
        environment: {
          ALERTS_TABLE: alertsTable.tableName,
        },
      }
    );

    alertsTable.grantReadWriteData(apiDynamodbAlertsHandler);

    apiDynamodbAlertsHandler.grantInvoke(
      new iam.ServicePrincipal("apigateway.amazonaws.com")
    );

    const alerts = api.addResource("alerts");
    const alertsByAddress = alerts.addResource("{address}");

    alerts.addMethod("POST", new LambdaIntegration(apiDynamodbAlertsHandler));

    alerts.addMethod("GET", new LambdaIntegration(apiDynamodbAlertsHandler));

    alertsByAddress.addMethod(
      "GET",
      new LambdaIntegration(apiDynamodbAlertsHandler),
      {
        authorizer: authorizer,
        authorizationType: AuthorizationType.COGNITO,
      }
    );

    alertsByAddress.addMethod(
      "DELETE",
      new LambdaIntegration(apiDynamodbAlertsHandler),
      {
        authorizer: authorizer,
        authorizationType: AuthorizationType.COGNITO,
      }
    );

    alertsByAddress.addMethod(
      "PUT",
      new LambdaIntegration(apiDynamodbAlertsHandler),
      {
        authorizer: authorizer,
        authorizationType: AuthorizationType.COGNITO,
      }
    );
  }
}
