const ddbClient = new AWS.DynamoDB.DocumentClient();

exports.handler = async (event, context, callback) => {
  let body;
  let statusCode = 200;

  let path = event.resource;
  let httpMethod = event.httpMethod;
  let route = httpMethod.concat(" ").concat(path);

  try {
    switch (route) {
      case "GET /users/subscriptions":
        console.log({
          message: "Retrieving subscriptions record from dynamodb table",
        });
        const readSubscriptionParams = {
          TableName: process.env.SUBSCRIPTIONS_TABLE,
          KeyConditionExpression: "#user_sub = :user_sub",
          ExpressionAttributeNames: {
            "#user_sub": "user_sub",
          },
          ExpressionAttributeValues: {
            ":user_sub": event.requestContext.authorizer.claims.sub,
          },
        };
        body = await ddbClient.query(readSubscriptionParams).promise();
        break;
      case "GET /users/subscriptions/{identifier}":
        const readProfileParams = {
          TableName: process.env.SUBSCRIPTIONS_TABLE,
          KeyConditionExpression:
            "#user_sub = :user_sub and #identifier = :identifier",
          ExpressionAttributeNames: {
            "#user_sub": "user_sub",
            "#identifier": "identifier",
          },
          ExpressionAttributeValues: {
            ":user_sub": event.requestContext.authorizer.claims.sub,
            ":identifier": event.pathParameters.identifier,
          },
        };
        body = await ddbClient.query(readProfileParams).promise();
        break;
      case "PUT /users/subscriptions/{identifier}":
        const data = JSON.parse(event.body);
        body = await ddbClient
          .put({
            TableName: process.env.SUBSCRIPTIONS_TABLE,
            Item: data, //Need to know what fields should be updated here for user subscriptions
          })
          .promise();
        break;
      case "DELETE /users/subscriptions/{identifier}":
        await ddbClient
          .delete({
            TableName: process.env.SUBSCRIPTIONS_TABLE,
            Key: {
              identifier: event.pathParameters.identifier,
              user_sub: "system",
            },
          })
          .promise();
        break;
      default:
        throw new Error(`Unsupported route: "${route}"`);
    }
  } catch (err) {
    console.log({error: JSON.stringify(err)});
    statusCode = 400;
    body = err.message;
  } finally {
    console.log({data: body});
    body = JSON.stringify(body);
  }

  return {
    statusCode,
    body,
  };
}
