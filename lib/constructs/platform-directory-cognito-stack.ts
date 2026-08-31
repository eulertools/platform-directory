import { Duration, RemovalPolicy, Stack, StackProps, } from "aws-cdk-lib";
import { Construct } from "constructs";
import * as iam from "aws-cdk-lib/aws-iam";
import * as lambda from "aws-cdk-lib/aws-lambda";
import * as cognito from "aws-cdk-lib/aws-cognito";
import { OAuthScope } from "aws-cdk-lib/aws-cognito";
import * as path from "path";
import * as route53 from "aws-cdk-lib/aws-route53";
import * as route53targets from "aws-cdk-lib/aws-route53-targets";
import { ICertificate } from "aws-cdk-lib/aws-certificatemanager";
import * as ssm from "aws-cdk-lib/aws-ssm";

interface AppStackProps extends StackProps {
  hostedZone: string;
  userPoolDomainName: string;
  publicZone: route53.IHostedZone;
  certificate: ICertificate;
}

export class PlatformDirectoryCognitoStack extends Construct {
  public readonly userPool: cognito.UserPool;
  public readonly userPoolClient: cognito.UserPoolClient;
  public readonly userPoolDomain: cognito.UserPoolDomain;

  constructor(scope: Stack, id: string, props?: AppStackProps) {
    super(scope, id);

    const {
      hostedZone,
      publicZone,
      certificate,
    } = props!;

    const cognitoSubscription = new lambda.Function(
      this,
      "PreSignupHandler",
      {
        handler: "index.handler",
        description: "Create subscriptions with AWS Cognito",
        code: lambda.Code.fromAsset(path.join(
          __dirname,
          `../../src/aws-cognito-lambda-pre-signup`
        )),
        runtime: lambda.Runtime.NODEJS_18_X,
        timeout: Duration.minutes(1),
      }
    );

    const cognitoUserMigrateHandler = new lambda.Function(
      this,
      "UserMigrateHandler",
      {
        handler: "index.handler",
        description: "Migrate users from another pool",
        code: lambda.Code.fromAsset(path.join(
          __dirname,
          `../../src/aws-cognito-user-migration-handler`
        )),
        runtime: lambda.Runtime.NODEJS_18_X,
        timeout: Duration.minutes(1),
        memorySize: 512,
      }
    );

    const userPool = new cognito.UserPool(this, `UserPool`, {
      selfSignUpEnabled: true,
      signInAliases: {
        email: true,
      },
      autoVerify: {
        email: true,
      },
      passwordPolicy: {
        minLength: 8,
        requireLowercase: true,
        requireDigits: true,
        requireUppercase: false,
        requireSymbols: false,
      },
      mfa: cognito.Mfa.OPTIONAL,
      accountRecovery: cognito.AccountRecovery.EMAIL_ONLY,
      removalPolicy: RemovalPolicy.DESTROY,
      lambdaTriggers: {},
    });

    this.userPool = userPool;

    const standardCognitoAttributes = {
      email: true,
      emailVerified: true,
      phoneNumber: true,
      phoneNumberVerified: true,
    };

    const clientReadAttributes =
      new cognito.ClientAttributes().withStandardAttributes(
        standardCognitoAttributes
      );

    const clientWriteAttributes =
      new cognito.ClientAttributes().withStandardAttributes({
        ...standardCognitoAttributes,
        emailVerified: false,
        phoneNumberVerified: false,
      });

    const userPoolClient = new cognito.UserPoolClient(
      this,
      `PoolClient`,
      {
        userPool,
        authFlows: {
          adminUserPassword: true,
          custom: true,
          userSrp: true,
          userPassword: true,
        },
        oAuth: {
          flows: {
            authorizationCodeGrant: true,
          },
          scopes: [
            OAuthScope.OPENID,
            OAuthScope.EMAIL,
            OAuthScope.PHONE,
            OAuthScope.COGNITO_ADMIN,
            OAuthScope.PROFILE,
          ],
          callbackUrls: [
            "http://localhost:8080/login",
            "https://oauth.pstmn.io/v1/browser-callback",
            "https://oauth.pstmn.io/v1/callback",
            "https://workflows.dev.euler.tools/login",
          ],
          logoutUrls: ["https://workflows.dev.euler.tools"],
        },
        supportedIdentityProviders: [
          cognito.UserPoolClientIdentityProvider.COGNITO,
        ],
        readAttributes: clientReadAttributes,
        writeAttributes: clientWriteAttributes,
      }
    );

    this.userPoolClient = userPoolClient;

    const userPoolAPIClient = new cognito.UserPoolClient(
      this,
      `poolApiClient`,
      {
        userPool,
        generateSecret: true,
        authFlows: {
          adminUserPassword: true,
          custom: true,
          userSrp: true,
          userPassword: true,
        },
        oAuth: {
          flows: {
            authorizationCodeGrant: true,
            implicitCodeGrant: true,
          },
          scopes: [
            OAuthScope.COGNITO_ADMIN,
            OAuthScope.EMAIL,
            OAuthScope.OPENID,
            OAuthScope.PHONE,
            OAuthScope.PROFILE,
          ],
          callbackUrls: [
            "http://localhost:8080/login",
            "https://oauth.pstmn.io/v1/browser-callback",
            "https://oauth.pstmn.io/v1/callback",
            "https://workflows.dev.euler.tools/login",
          ],
        },
        supportedIdentityProviders: [
          cognito.UserPoolClientIdentityProvider.COGNITO,
        ],
      }
    );

    const domain = new cognito.UserPoolDomain(
      this,
      `CustomDomain`,
      {
        userPool,
        customDomain: {
          domainName: `warden.${hostedZone}`,
          certificate: certificate,
        },
      }
    );

    this.userPoolDomain = domain;

    new route53.ARecord(this, `PublicRecord`, {
      zone: publicZone,
      recordName: `warden`,
      target: route53.RecordTarget.fromAlias(
        new route53targets.UserPoolDomainTarget(domain)
      ),
    });

    cognitoSubscription.role?.attachInlinePolicy(
      new iam.Policy(this, `StateMachinePolicy`, {
        statements: [
          new iam.PolicyStatement({
            actions: [
              "cognito-idp:DescribeUserPool",
              "states:DescribeStateMachine",
              "states:StartExecution",
              "states:DeleteStateMachine",
              "states:ListExecutions",
              "states:UpdateStateMachine",
            ],
            resources: [userPool.userPoolArn],
          }),
        ],
      })
    );

    cognitoUserMigrateHandler.role?.attachInlinePolicy(
      new iam.Policy(this, `UserMigrationHandlerPolicy`, {
        statements: [
          new iam.PolicyStatement({
            actions: [
              "cognito-idp:AdminInitiateAuth",
              "cognito-idp:AdminGetUser",
            ],
            resources: ["*"],
          }),
        ],
      })
    );

    new ssm.StringParameter(
      this,
      `SSMPoolId`,
      {
        stringValue: userPool.userPoolId,
        parameterName: `/directory/cognito/warden`,
      }
    );

    new ssm.StringParameter(
      this,
      `SSMPoolClientId`,
      {
        stringValue: userPoolClient.userPoolClientId,
        parameterName: `/directory/cognito/poolClientId`,
      }
    );

    new ssm.StringParameter(
      this,
      `SSAPIClientId`,
      {
        stringValue: userPoolAPIClient.userPoolClientId,
        parameterName: `/directory/cognito/user-pool-api-client-id`,
      }
    );

    new ssm.StringParameter(
      this,
      `SSMPoolDomain`,
      {
        stringValue: domain.domainName,
        parameterName: `/directory/cognito/user-pool-domain-name`,
      }
    );
  }
}
