const randomString = require("randomstring");


AWS.config.update({region: process.env.AWS_REGION});

const ddbClient = new AWS.DynamoDB.DocumentClient();

const snsClient = new AWS.SNS();

const hostedZone = process.env.HOSTED_ZONE || "";

const init = async () => {
};

exports.handler = async (event, context, callback) => {
  console.log({
    message: "Retrieving records from the events",
    DATA: event.Payload,
  });

  try {
    const date = new Date();
    console.log({
      message: `Inserting data into dynamodb table ${process.env.SUBSCRIPTIONS_TABLE}`,
    });

    try {
      const params = {
        TableName: process.env.SUBSCRIPTIONS_SETTINGS_TABLE,
        Key: {
          identifier: "subscription_setting~free",
          owner: "system",
        },
      };

      await ddbClient
        .get(params)
        .promise()
        .then(async (data) => {
          const expired_at = date.setDate(date.getDate() + 30);

          data.Item.identifier = `subscriptions~${event.Payload.event.userName}`;
          data.Item.user_sub = event.Payload.event.userName;
          data.Item.created_at = date.toISOString();
          data.Item.expired_at = new Date(expired_at).toISOString();

          const subscriptionsParams = {
            TableName: process.env.SUBSCRIPTIONS_TABLE,
            Item: data.Item,
          };

          try {
            console.log({message: "Inserting..."});
            await ddbClient.put(subscriptionsParams).promise();
            console.log({message: "Inserted Successfully"});
            const params = {
              Message: JSON.stringify({
                user_email: event.Payload.event.request.userAttributes.email,
              }),
              TopicArn: process.env.SNS_TOPIC_ARN,
            };
            await snsClient
              .publish(params)
              .promise()
              .then(async () => {
                console.log({
                  message: "User details enqueued to sns successfully...",
                });
                const options = {
                  method: "PUT",
                  headers: {
                    Accept: "application/json",
                    "Content-Type": "application/json;charset=UTF-8",
                  },
                  body: JSON.stringify({
                    user_sub: event.Payload.event.request.userAttributes.sub,
                    notification_id: randomString.generate(),
                  }),
                };
                fetch(`https://notifications.api.${hostedZone}/users/notification`, options)
                  .then(() => {
                    console.log("Notification inserted...");
                  })
                  .catch((err) => {
                    console.log("Error: ", err);
                  });
              })
              .catch((err) => {
                console.log("Err: ", err);
              });
          } catch (err) {
            console.log({
              message: "Error occured",
              error: JSON.stringify(err),
            });
            throw err;
          }
        })
        .catch((err) => {
          console.log({
            message: "error occured while inserting, ",
            error: JSON.stringify(err),
          });
        });
    } catch (err) {
      console.log({
        message: "Inserting data into dynamodb failed,",
        error: JSON.stringify(err),
      });
      throw err;
    }
  } catch (err) {
    console.log({
      message: "Inserting data into dynamodb failed,",
      error: JSON.stringify(err),
    });
    throw err;
  }

  init();
  return context.done(null, event);
}
