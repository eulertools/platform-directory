import { Stack, StackProps } from "aws-cdk-lib";
import { Construct } from "constructs";
import { PlatformDirectoryApiStack } from "../constructs/platform-directory-api-stack";
import { PlatformDirectoryCognitoStack } from "../constructs/platform-directory-cognito-stack";
import { PlatformDirectoryStorageStack } from "../constructs/platform-directory-storage-stack";
import * as cognito from "aws-cdk-lib/aws-cognito";
import * as route53 from "aws-cdk-lib/aws-route53";
import * as certificatemanager from "aws-cdk-lib/aws-certificatemanager";
import * as ssm from "aws-cdk-lib/aws-ssm";

interface AppStackProps extends StackProps {
  hostedZone: string;
  domainName: string;
  clientName: string;
  notifications: boolean;
  alerts: boolean;
  certificateSsm: string;
  cognitoStack: boolean;
  directoryApiStack: boolean;
}

export class Directory extends Stack {
  public readonly userPool: cognito.UserPool;
  public readonly userPoolClient: cognito.UserPoolClient;
  public readonly userPoolDomain: cognito.UserPoolDomain;

  constructor(scope: Construct, id: string, props?: AppStackProps) {
    super(scope, id, props);

    const {hostedZone, directoryApiStack, domainName, clientName, notifications, alerts, certificateSsm, cognitoStack} =
      props!;

    const publicZone = route53.HostedZone.fromLookup(
      this,
      "PublicZone",
      {
        privateZone: false,
        domainName: hostedZone,
      }
    );

    const certificate = certificatemanager.Certificate.fromCertificateArn(
      this,
      'Certificate',
      ssm.StringParameter.fromStringParameterName(
        this,
        "CertificateArn",
        "/certificates/cognito/warden"
      ).stringValue
    )

    const directoryPool = new PlatformDirectoryCognitoStack(
      this,
      `Cognito`,
      {
        hostedZone,
        publicZone,
        certificate,
        userPoolDomainName: domainName,
      }
    );

    this.userPool = directoryPool.userPool;

    this.userPoolClient = directoryPool.userPoolClient;
    this.userPoolDomain = directoryPool.userPoolDomain;

    if (directoryApiStack) {
      const directoryStorage = new PlatformDirectoryStorageStack(
        this,
        `Storage`,
        {
          clientName,
        }
      );
 
      new PlatformDirectoryApiStack(this, "Api", {
        hostedZone,
        userPool: directoryPool.userPool,
        clientName,
        userProfilesTable: directoryStorage.userProfilesTable,
        userSubscriptionsTable: directoryStorage.userSubscriptionTable,
        directoryApiName: "warden",
        userNotificationStream: directoryStorage.userNotificationStream,
        userNotificationTable: directoryStorage.userNotificationTable,
        notifications,
        alerts,
      });
    }
  }
}
