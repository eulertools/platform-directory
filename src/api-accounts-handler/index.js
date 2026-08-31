import { DynamoDBClient } from "@aws-sdk/client-dynamodb";

const ddbClient = new DynamoDBClient({region: process.env.AWS_REGION});

exports.handler = async (event, context, callback) => {
  let body;
  let statusCode = 200;

  let path = event.resource;
  let httpMethod = event.httpMethod;
  let route = httpMethod.concat(" ").concat(path);

  // this method should be used to anonymize the data of the user trying to delete his account.
  // review with the legal team if this is the best way to do it.

  try {
    switch (route) {
      case "DELETE /users/accounts/{identifier}":
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
