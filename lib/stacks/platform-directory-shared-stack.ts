import { Stack, StackProps } from "aws-cdk-lib";
import { Construct } from "constructs";
import { PlatformDirectoryApiStack } from "../constructs/platform-directory-api-stack";
import { PlatformDirectoryCognitoStack } from "../constructs/platform-directory-cognito-stack";
import { PlatformDirectoryStorageStack } from "../constructs/platform-directory-storage-stack";
import * as cognito from "aws-cdk-lib/aws-cognito";
import * as route53 from "aws-cdk-lib/aws-route53";
import * as certificatemanager from "aws-cdk-lib/aws-certificatemanager";
import * as lambda from "aws-cdk-lib/aws-lambda";
import * as ssm from "aws-cdk-lib/aws-ssm";
import { ICertificate } from "aws-cdk-lib/aws-certificatemanager";
import * as crossparam from '@henrist/cdk-cross-region-params';

interface AppStackProps extends StackProps {
  hostedZone: string;
}

export class DirectorySharedResources extends Stack {
  public readonly certificateSsm: string;

  constructor(scope: Construct, id: string, props?: AppStackProps) {
    super(scope, id, props);

    const {hostedZone} =
      props!;

    const publicZone = route53.HostedZone.fromLookup(
      this,
      "PublicZone",
      {
        privateZone: false,
        domainName: hostedZone,
      }
    );

    const certificate = new certificatemanager.Certificate(
      this,
      "DirectoryCertificate",
      {
        domainName: hostedZone,
        subjectAlternativeNames: [`warden.${hostedZone}`, `api.warden.${hostedZone}`],
        validation: certificatemanager.CertificateValidation.fromDns(publicZone),
      }
    );

    new crossparam.CrossRegionParameter(this, 'UsCert', {
      region: 'us-east-1',
      name: '/certificates/cognito/warden',
      value: certificate.certificateArn
    })

    new crossparam.CrossRegionParameter(this, 'EuCert', {
      region: 'eu-west-1',
      name: '/certificates/cognito/warden',
      value: certificate.certificateArn
    })

    this.certificateSsm = '/certificates/cognito/warden'
  }
}
