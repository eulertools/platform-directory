import { Duration, StackProps } from "aws-cdk-lib";
import * as lambda from "aws-cdk-lib/aws-lambda";
import * as path from "path";
import * as iam from "aws-cdk-lib/aws-iam";
import {
  AuthorizationType,
  CognitoUserPoolsAuthorizer,
  LambdaIntegration,
  Resource,
} from "aws-cdk-lib/aws-apigateway";
import * as cognito from "aws-cdk-lib/aws-cognito";
import * as kinesis from "aws-cdk-lib/aws-kinesis";
import * as dynamodb from "aws-cdk-lib/aws-dynamodb";
import { KinesisEventSource } from "aws-cdk-lib/aws-lambda-event-sources";
import { Construct } from "constructs";

interface AppStackProps extends StackProps {
  hostedZone: string;
  userNotificationStream: kinesis.Stream;
  userNotificationTable: dynamodb.Table;
  clientName: string;
  userPool: cognito.UserPool;
  api: Resource;
  authorizer: CognitoUserPoolsAuthorizer;
}

export class PlatformNotificationsStack extends Construct {
  constructor(scope: Construct, id: string, props?: AppStackProps) {
    super(scope, id);

    const {
      hostedZone,
      userNotificationStream,
      userNotificationTable,
      clientName,
      userPool,
      api,
      authorizer,
    } = props!;

    const notificationHandler = new lambda.Function(
      this,
      "api-notifications-handler",
      {
        handler: "index.handler",
        description: "Create Notification Api Gateway",
        code: lambda.Code.fromAsset(path.join(
          __dirname,
          `/../../src/notifications-api-gateway-handler`)
        ),
        runtime: lambda.Runtime.NODEJS_18_X,
        timeout: Duration.minutes(1),
        environment: {
          NOTIFICATION_TABLE: userNotificationTable.tableName,
        },
      }
    );

    notificationHandler.grantInvoke(
      new iam.ServicePrincipal("apigateway.amazonaws.com")
    );

    userNotificationTable.grantReadWriteData(notificationHandler);

    const notificationMailSenderHandler = new lambda.Function(
      this,
      "notifications-mail-sender-handler",
      {
        handler: "index.handler",
        description: "Create lambda function with SES to send email.",
        code: lambda.Code.fromAsset(path.join(
          __dirname,
          `/../../src/notifications-mail-sender-handler`
        )),
        runtime: lambda.Runtime.NODEJS_18_X,
        timeout: Duration.seconds(30),
        environment: {
          USER_POOL_ID: userPool.userPoolId,
          HOSTED_ZONE: hostedZone,
        },
      }
    );

    notificationMailSenderHandler.addEventSource(
      new KinesisEventSource(userNotificationStream, {
        batchSize: 100,
        startingPosition: lambda.StartingPosition.TRIM_HORIZON,
      })
    );

    notificationMailSenderHandler.role?.attachInlinePolicy(
      new iam.Policy(this, `${clientName}-mail-sender-policy`, {
        statements: [
          new iam.PolicyStatement({
            effect: iam.Effect.ALLOW,
            actions: [
              "ses:SendEmail",
              "ses:SendRawEmail",
              "ses:SendTemplatedEmail",
              "cognito-idp:AdminGetUser",
            ],
            resources: [
              "*",
            ],
          }),
        ],
      })
    );

    const notifications = api.addResource("notifications");
    const notificationId = notifications.addResource("{notification_id}");

    notifications.addMethod(
      "GET",
      new LambdaIntegration(notificationHandler),
      {
        authorizer: authorizer,
        authorizationType: AuthorizationType.COGNITO,
      }
    );

    notifications.addMethod(
      "PUT",
      new LambdaIntegration(notificationHandler),
      {
        authorizer: authorizer,
        authorizationType: AuthorizationType.COGNITO,
      }
    );

    notifications.addMethod(
      "POST",
      new LambdaIntegration(notificationHandler),
      {
        authorizer: authorizer,
        authorizationType: AuthorizationType.COGNITO,
      }
    );

    notifications.addMethod(
      "DELETE",
      new LambdaIntegration(notificationHandler),
      {
        authorizer: authorizer,
        authorizationType: AuthorizationType.COGNITO,
      }
    );

    notificationId.addMethod(
      "GET",
      new LambdaIntegration(notificationHandler),
      {
        authorizer: authorizer,
        authorizationType: AuthorizationType.COGNITO,
      });

    notificationId.addMethod(
      "PUT",
      new LambdaIntegration(notificationHandler),
      {
        authorizer: authorizer,
        authorizationType: AuthorizationType.COGNITO,
      });

    notificationId.addMethod(
      "DELETE",
      new LambdaIntegration(notificationHandler),
      {
        authorizer: authorizer,
        authorizationType: AuthorizationType.COGNITO,
      }
    );
  }
}
