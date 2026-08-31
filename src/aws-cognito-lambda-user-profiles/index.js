const AWS = require("aws-sdk");
AWS.config.update({region: process.env.AWS_REGION});

const ddbClient = new AWS.DynamoDB.DocumentClient();

async function lookupUser(cognitoISP, username, userPoolId) {
  console.log({message: `Lookuping User: ${username}`});

  try {
    const params = {
      UserPoolId: userPoolId,
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

exports.handler = async (event, context, callback) => {
  console.log({message: "Retrieving records from the events"});
  const options = {
    region: process.env.AWS_REGION,
  };

  const cognitoIdentityServiceProvider = new CognitoIdentityServiceProvider(
    options
  );
  try {
    const user = await lookupUser(
      cognitoIdentityServiceProvider,
      event.event.request.userAttributes.email,
      event.event.userPoolId
    );
    try {
      let status;
      let isBlocked = true;
      if (user?.userAttributes.email_verified === "true") {
        status = "Verified";
        isBlocked = false;
      } else {
        status = "Not Verified";
      }

      const userParams = {
        TableName: process.env.USER_PROFILES_TABLE,
        Item: {
          identifier: user?.userAttributes.email,
          user_sub: user?.userAttributes.sub,
          status: status,
          isBlocked: isBlocked,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        },
      };
      console.log({message: "Inserting..."});
      await ddbClient.put(userParams).promise();
      console.log({message: "Inserted Successfully"});
    } catch (err) {
      console.log({message: "Error occured", error: JSON.stringify(err)});
      throw err;
    }
  } catch (err) {
    console.log({
      message: "Inserting data into dynamodb failed,",
      error: JSON.stringify(err),
    });
    throw err;
  }
  return context.done(null, event);
}
