import { Stack, StackProps } from "aws-cdk-lib";
import { Construct } from "constructs";
import * as cr from "aws-cdk-lib/custom-resources";
import * as fs from "fs";
import * as cognito from "aws-cdk-lib/aws-cognito";
import * as path from "path";

interface AppStackProps extends StackProps {
  userPool: cognito.UserPool;
  userPoolClient: cognito.UserPoolClient;
  userPoolDomain: cognito.UserPoolDomain;
}

export class PlatformDirectoryCognitoUIStack extends Stack {
  constructor(scope: Construct, id: string, props?: AppStackProps) {
    super(scope, id, props);

    const {userPool, userPoolClient, userPoolDomain} = props!;

    new cr.AwsCustomResource(this, `CognitoCustomUI`, {
      resourceType: "Custom::CognitoUiCustomization",
      onCreate: {
        service: "CognitoIdentityServiceProvider",
        action: "setUICustomization",
        parameters: {
          UserPoolId: userPool.userPoolId,
          ClientId: userPoolClient.userPoolClientId,
          imageFile: fs.readFileSync(path.join(__dirname, `/../assets/images/image.png`)).toString("base64"),
          CSS: fs
            .readFileSync(path.join(__dirname + "/../assets/cognito-login.css"))
            .toString("utf-8"),
        },
        physicalResourceId: cr.PhysicalResourceId.of(
          `cognito-ui-logo-all-clients-${userPoolDomain.domainName}`
        ),
      },
      policy: cr.AwsCustomResourcePolicy.fromSdkCalls({
        resources: cr.AwsCustomResourcePolicy.ANY_RESOURCE,
      }),
    });
  }
}
