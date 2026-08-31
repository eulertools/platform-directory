const REGION = process.env.AWS_REGION || "";

const USER_POOL_ID = process.env.USER_POOL_ID || "";

const CLIENT_ID = process.env.CLIENT_ID || "";

async function authenticateUser(cognitoISP, username, password) {
  console.log({message: `Authenticating User: ${username}`});

  try {
    const params = {
      AuthFlow: "ADMIN_USER_PASSWORD_AUTH",
      AuthParameters: {
        PASSWORD: password,
        USERNAME: username,
      },
      ClientId: CLIENT_ID,
      UserPoolId: USER_POOL_ID,
    };
    const cognitoResponse = await cognitoISP
      .adminInitiateAuth(params)
      .promise();
    console.log({
      message: "User Authenticated:",
      data: JSON.stringify(cognitoResponse),
    });
    return lookupUser(cognitoISP, username);
  } catch (err) {
    console.log({
      message: "Error Occured while user authentication: ",
      error: JSON.stringify(err),
    });
    return undefined;
  }
}

async function lookupUser(cognitoISP, username) {
  console.log({message: `Lookuping User: ${username}`});

  try {
    const params = {
      UserPoolId: USER_POOL_ID,
      Username: username,
    };
    const cognitoResponse = await cognitoISP.adminGetUser(params).promise();
    console.log({
      message: "Lookup User Found: ",
      data: JSON.stringify(cognitoResponse),
    });

    const userAttributes = cognitoResponse.UserAttributes
      ? cognitoResponse.UserAttributes.reduce(
        (acc, entry) => ({
          ...acc,
          [entry.Name]: entry.Value,
        }),
        {}
      )
      : {};
    const user = {
      userAttributes,
      userName: cognitoResponse.Username,
    };
    console.log({
      message: "Response of lookup user: ",
      data: JSON.stringify(user),
    });
    return user;
  } catch (err) {
    console.log({
      message: "Error Occured while lookuping user: ",
      error: JSON.stringify(err),
    });
    return undefined;
  }
}

async function onUserMigrationAuthentication(cognitoISP, event, context) {
  const user = await authenticateUser(
    cognitoISP,
    event.userName,
    event.request.password
  );
  if (!user) {
    throw new Error("Bad credentials");
  }

  event.response.userAttributes = {
    email: user.userAttributes.email,
    email_verified: "true",
    preferred_username: user.userAttributes.preferred_username,
  };
  event.response.finalUserStatus = "CONFIRMED";
  event.response.messageAction = "SUPPRESS";
  context.succeed(event);
  console.log({
    message: "Authentication - response:",
    data: JSON.stringify(event.response),
  });
  return event;
}

async function onUserMigrationForgotPassword(cognitoISP, event, context) {
  const user = await lookupUser(cognitoISP, event.userName);
  if (!user) {
    throw new Error("Bad credentials");
  }

  event.response.userAttributes = {
    email: user.userAttributes.email,
    email_verified: "true",
    preferred_username: user.userAttributes.preferred_username,
  };
  event.response.messageAction = "SUPPRESS";
  context.succeed(event);
  console.log({
    message: "Forgot password - response:",
    data: JSON.stringify(event.response),
  });

  return event;
}

exports.handler = async (event, context) => {
  const options = {
    region: REGION,
  };

  const cognitoIdentityServiceProvider = new CognitoIdentityServiceProvider(
    options
  );

  switch (event.triggerSource) {
    case "UserMigration_Authentication":
      return onUserMigrationAuthentication(
        cognitoIdentityServiceProvider,
        event,
        context
      );
    case "UserMigration_ForgotPassword":
      return onUserMigrationForgotPassword(
        cognitoIdentityServiceProvider,
        event,
        context
      );
    default:
      throw new Error(`Bad triggerSource ${event}`);
  }
};
