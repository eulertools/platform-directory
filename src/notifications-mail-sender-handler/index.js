const ses = new AWS.SES({region: process.env.AWS_REGION});

const userPoolId = process.env.USER_POOL_ID || "";

const hostedZone = process.env.HOSTED_ZONE || "";

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
  console.log({message: "Retrieving records from Kinesis Stream..."});
  const options = {
    region: process.env.AWS_REGION,
  };

  const cognitoIdentityServiceProvider = new CognitoIdentityServiceProvider(
    options
  );
  try {
    const evenDdata = event.Records.map((record) => {
      const payload = Buffer.from(record.kinesis.data, "base64").toString(
        "ascii"
      );
      const req = JSON.parse(payload);
      return req.dynamodb.Keys;
    });

    const user = await lookupUser(
      cognitoIdentityServiceProvider,
      evenDdata[0].user_id.S,
      userPoolId
    );
    if (user) {
      const data = await fetch(
        `https://assets.communications.${hostedZone}/euler-tools-emails/template_body/notification-body.txt`
      ).then((res) => {
        return res.text();
      })

      const params = {
        Destination: {
          ToAddresses: [user.userAttributes.email],
        },
        Template: "notification",
        TemplateData: JSON.stringify({
          notification_message: data.notification_message,
        }),
        Source: "no-reply@euler.tools",
      };
      console.log({message: "Sending email..."});
      await ses
        .sendTemplatedEmail(params)
        .promise()
        .catch((err) => {
          console.log("Err: ", err);
        });
      console.log({message: "Email sent successfully...."});
    }
  } catch (err) {
    console.log({
      message: "Error occured while sending mail.",
      error: JSON.stringify(err),
    });
  }

  return JSON.stringify({
    body: {
      message: "Lambda Executed Successfully...",
    },
    statusCode: 200,
  });
};
