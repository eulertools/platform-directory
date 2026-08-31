const userPoolId = process.env.USER_POOL_ID || "";
const sourceArn = process.env.SOURCE_ARN || "";
const from = process.env.FROM || "";
const hostedZone = process.env.HOSTED_ZONE || "";

const client = new CognitoIdentityServiceProvider();

exports.handler = async (event, context, callback) => {
  const data = await fetch(
    `https://assets.communications.${hostedZone}/euler-tools-emails/html/forgot-password.html`
  )
    .then((res) => {
      return res.text();
    });

  const params = {
    UserPoolId: userPoolId,
    AutoVerifiedAttributes: ["email"],
    LambdaConfig: {
      UserMigration: process.env.USER_MIGRATION_LAMBDA_ARN || "",
      PostAuthentication: process.env.POST_AUTH_LAMBDA_ARN || "",
      PostConfirmation: process.env.POST_CONFIRMATION_LAMBDA_ARN || "",
      PreAuthentication: process.env.PRE_AUTH_LAMBDA_ARN || "",
    },
    EmailConfiguration: {
      EmailSendingAccount: "DEVELOPER",
      From: from,
      SourceArn: sourceArn,
    },
    VerificationMessageTemplate: {
      DefaultEmailOption: "CONFIRM_WITH_CODE",
      EmailMessage: data,
      EmailSubject: "Euler Tools | Verification Code",
    },
  };

  try {
    await client
      .updateUserPool(params)
      .promise()
      .catch((err) => {
        throw err;
      });
  } catch (err) {
    console.log({
      message: "Error occured while updating the cognito pool: ",
      error: JSON.stringify(err),
    });
  }
}
