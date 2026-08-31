import { Duration, Stack, StackProps } from "aws-cdk-lib";
import { Construct } from "constructs";
import {
  AuthorizationType,
  CognitoUserPoolsAuthorizer,
  LambdaIntegration,
  LambdaRestApi,
} from "aws-cdk-lib/aws-apigateway";
import * as path from "path";
import * as lambda from "aws-cdk-lib/aws-lambda";
import * as certificatemanager from "aws-cdk-lib/aws-certificatemanager";
import * as dynamodb from "aws-cdk-lib/aws-dynamodb";
import * as route53 from "aws-cdk-lib/aws-route53";
import * as secretsmanager from "aws-cdk-lib/aws-secretsmanager";
import * as route53targets from "aws-cdk-lib/aws-route53-targets";
import * as iam from "aws-cdk-lib/aws-iam";
import { Effect } from "aws-cdk-lib/aws-iam";
import * as cognito from "aws-cdk-lib/aws-cognito";
import * as kinesis from "aws-cdk-lib/aws-kinesis";
import { PlatformNotificationsStack } from "./platform-notifications-stack";
import { PlatformDirectoryAlertsApiStack } from "./platform-directory-alerts-api-stack";

interface AppStackProps extends StackProps {
  hostedZone: string;
  userPool: cognito.UserPool;
  userSubscriptionsTable: dynamodb.Table;
  userProfilesTable: dynamodb.Table;
  directoryApiName: string;
  clientName: string;
  userNotificationStream: kinesis.Stream;
  userNotificationTable: dynamodb.Table;
  notifications: boolean;
  alerts: boolean;
}

export class PlatformDirectoryApiStack extends Construct {
  constructor(scope: Stack, id: string, props?: AppStackProps) {
    super(scope, id);

    const {
      hostedZone,
      userPool,
      userSubscriptionsTable,
      userProfilesTable,
      directoryApiName,
      clientName,
      userNotificationStream,
      userNotificationTable,
      notifications,
      alerts,
    } = props!;

    const publicZone = route53.HostedZone.fromLookup(
      this,
      `PublicZone`,
      {
        privateZone: false,
        domainName: hostedZone,
      }
    );

    const certificate = new certificatemanager.Certificate(this, "ApiCertificate", {
      domainName: `warden.${hostedZone}`,
      subjectAlternativeNames: [`api.warden.${hostedZone}`, `*.warden.${hostedZone}`],
      validation: certificatemanager.CertificateValidation.fromDns(publicZone),
    });

    const sentryDSN = secretsmanager.Secret.fromSecretNameV2(
      this,
      "sentryDSN",
      "sentryDSN"
    ).secretValue.unsafeUnwrap();

    const apiDynamodbSubscription = new lambda.Function(
      this,
      "SubscriptionsApiHandler",
      {
        handler: "index.handler",
        description:
          "Create subscriptions api that retrieves records from dynamodb",
        code: lambda.Code.fromAsset(path.join(
          __dirname,
          `/../../src/api-subscriptions-handler`
        )),
        runtime: lambda.Runtime.NODEJS_18_X,
        timeout: Duration.minutes(1),
        environment: {
          SUBSCRIPTIONS_TABLE: userSubscriptionsTable.tableName,
          DSN_URL: sentryDSN,
        },
      }
    );

    userSubscriptionsTable.grantReadWriteData(apiDynamodbSubscription);

    apiDynamodbSubscription.grantInvoke(
      new iam.ServicePrincipal("apigateway.amazonaws.com")
    );

    const apiDynamodbProfiles = new lambda.Function(
      this,
      "ProfilesApiHandler",
      {
        handler: "index.handler",
        description: "Create profiles api that retrieves records from dynamodb",
        code: lambda.Code.fromAsset(path.join(
          __dirname,
          `/../../src/api-profiles-handler`
        )),
        runtime: lambda.Runtime.NODEJS_18_X,
        timeout: Duration.minutes(1),
        environment: {
          PROFILES_TABLE: userProfilesTable.tableName,
          DSN_URL: sentryDSN,
        },
      }
    );

    userProfilesTable.grantReadWriteData(apiDynamodbProfiles);

    apiDynamodbProfiles.grantInvoke(
      new iam.ServicePrincipal("apigateway.amazonaws.com")
    );

    const cognitoUsersHandler = new lambda.Function(
      this,
      "CognitoUserHandler",
      {
        handler: "index.handler",
        description: "Create users api that deletes users from cognito",
        code: lambda.Code.fromAsset(path.join(
          __dirname,
          `/../../src/api-accounts-handler`
        )),
        runtime: lambda.Runtime.NODEJS_18_X,
        timeout: Duration.minutes(1),
        environment: {
          PROFILES_TABLE: userProfilesTable.tableName,
          DSN_URL: sentryDSN,
          SUBSCRIPTIONS_TABLE: userSubscriptionsTable.tableName,
          USER_POOL_ID: userPool.userPoolId,
          HOSTED_ZONE: hostedZone,
        },
      }
    );

    cognitoUsersHandler.grantInvoke(
      new iam.ServicePrincipal("apigateway.amazonaws.com")
    );

    cognitoUsersHandler.role?.attachInlinePolicy(
      new iam.Policy(this, `UserHandlerPolicy`, {
        statements: [
          new iam.PolicyStatement({
            actions: [
              "cognito-idp:AdminGetUser",
              "cognito-idp:AdminDeleteUser",
            ],
            resources: [userPool.userPoolArn],
          }),
        ],
      })
    );

    const apiResourcePolicy = new iam.PolicyDocument({
      statements: [
        new iam.PolicyStatement({
          effect: Effect.ALLOW,
          actions: ["execute-api:Invoke"],
          principals: [new iam.AnyPrincipal()],
          resources: ["execute-api:/*"],
        }),
      ],
    });

    const restApi = new LambdaRestApi(this, `AppUsersApi`, {
      handler: apiDynamodbSubscription,
      deployOptions: {
        stageName: process.env.ENV,
      },
      defaultCorsPreflightOptions: {
        allowHeaders: ["Content-Type", "Authorization"],
        allowMethods: ["OPTIONS", "GET", "POST", "PUT", "PATCH", "DELETE"],
        allowCredentials: true,
        allowOrigins: [
          `https://workflows.${hostedZone}`,
          "http://localhost:8080",
        ],
      },
      restApiName: `platform-directory-${clientName}-api`,
      proxy: false,
      policy: apiResourcePolicy,
    });

    restApi.addDomainName(`UsersApi`, {
      domainName: `api.${directoryApiName}.${hostedZone}`,
      certificate: certificate,
    });

    new route53.ARecord(this, `DomainRecord`, {
      recordName: `api.${directoryApiName}`,
      zone: publicZone,
      target: route53.RecordTarget.fromAlias(
        new route53targets.ApiGateway(restApi)
      ),
    });

    const authorizer = new CognitoUserPoolsAuthorizer(
      this,
      `CognitoAuthorizer`,
      {
        cognitoUserPools: [userPool],
        authorizerName: "cognito-authorizer",
        identitySource: "method.request.header.Authorization",
      }
    );

    const users = restApi.root.addResource("users");
    const oneUser = users.addResource("{identifier}");
    const allSubscription = users.addResource("subscriptions");
    const oneSubscription = allSubscription.addResource("{identifier}");

    if (alerts) {
      new PlatformDirectoryAlertsApiStack(this, `AlertsApi`, {
        hostedZone: hostedZone,
        userPool,
        tableName: directoryApiName,
        certificate,
        api: users,
        authorizer,
      });
    }

    if (notifications) {
      new PlatformNotificationsStack(this, `NotificationsApi`, {
        hostedZone,
        clientName,
        userPool,
        userNotificationStream,
        userNotificationTable,
        api: users,
        authorizer,
      });
    }

    oneUser.addMethod("DELETE", new LambdaIntegration(cognitoUsersHandler), {
      authorizer: authorizer,
      authorizationType: AuthorizationType.COGNITO,
    });

    allSubscription.addMethod(
      "GET",
      new LambdaIntegration(apiDynamodbSubscription),
      {
        authorizer: authorizer,
        authorizationType: AuthorizationType.COGNITO,
      }
    );

    oneSubscription.addMethod(
      "GET",
      new LambdaIntegration(apiDynamodbSubscription),
      {
        authorizer: authorizer,
        authorizationType: AuthorizationType.COGNITO,
      }
    );

    oneSubscription.addMethod(
      "DELETE",
      new LambdaIntegration(apiDynamodbSubscription),
      {
        authorizer: authorizer,
        authorizationType: AuthorizationType.COGNITO,
      }
    );

    oneSubscription.addMethod(
      "PUT",
      new LambdaIntegration(apiDynamodbSubscription),
      {
        authorizer: authorizer,
        authorizationType: AuthorizationType.COGNITO,
      }
    );

    const allProfiles = users.addResource("profiles");
    const oneProfiles = allProfiles.addResource("{identifier}");

    allProfiles.addMethod(
      "GET",
      new LambdaIntegration(apiDynamodbProfiles),
      {
        authorizer: authorizer,
        authorizationType: AuthorizationType.COGNITO,
      }
    );

    oneProfiles.addMethod(
      "GET",
      new LambdaIntegration(apiDynamodbProfiles),
      {
        authorizer: authorizer,
        authorizationType: AuthorizationType.COGNITO,
      }
    );

    allProfiles.addMethod(
      "POST",
      new LambdaIntegration(apiDynamodbProfiles),
      {
        authorizer: authorizer,
        authorizationType: AuthorizationType.COGNITO,
      }
    );

    oneProfiles.addMethod(
      "PUT",
      new LambdaIntegration(apiDynamodbProfiles),
      {
        authorizer: authorizer,
        authorizationType: AuthorizationType.COGNITO,
      }
    );

    oneProfiles.addMethod(
      "DELETE",
      new LambdaIntegration(apiDynamodbProfiles),
      {
        authorizer: authorizer,
        authorizationType: AuthorizationType.COGNITO,
      }
    );
  }
}
