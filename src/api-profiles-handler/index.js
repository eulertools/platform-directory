const {
  DynamoDBClient,
  QueryCommand,
  PutItemCommand,
  UpdateItemCommand,
  GetItemCommand,
  DeleteItemCommand
} = require("@aws-sdk/client-dynamodb");
const {marshall, unmarshall} = require("@aws-sdk/util-dynamodb");

const ddbClient = new DynamoDBClient({
  region: process.env.AWS_REGION,
});

exports.handler = async (event, context, callback) => {
  const body = JSON.parse(event.body);
  console.log(event.body);
  let statusCode = 200;

  let path = event.resource;
  let httpMethod = event.httpMethod;
  let route = httpMethod.concat(" ").concat(path);

  let responseBody;

  try {
    switch (route) {
      case "GET /users/profiles":
        console.log({
          message: "Retrieving all profiles records from dynamodb table",
        });
        const readProfilesParams = new QueryCommand({
          TableName: process.env.PROFILES_TABLE,
          KeyConditionExpression: "#user_sub = :user_sub",
          ExpressionAttributeNames: {
            "#user_sub": "user_sub",
          },
          ExpressionAttributeValues: {
            ":user_sub": {S: event.requestContext.authorizer.claims.sub},
          },
        });
        responseBody = await ddbClient
          .send(readProfilesParams)
          .then((data) => {
            return data.Items.map((item) => unmarshall(item));
          })
          .catch((error) => {
            console.log("error here", error);
            throw error
          })
        break;
      case "GET /users/profiles/{identifier}":
        const getProfileParams = new GetItemCommand({
          TableName: process.env.PROFILES_TABLE,
          Key: {
            "user_sub": {S: event.requestContext.authorizer.claims.sub},
            "identifier": {S: event.pathParameters.identifier},
          }
        });
        responseBody = await ddbClient
          .send(getProfileParams)
          .then((record) => {
            if (record.Item) {
              return unmarshall(record.Item);
            } else {
              statusCode = 404
              return {}
            }
          });
        break;
      case "POST /users/profiles":
        const itemData = {
          ...body,
          user_sub: event.requestContext.authorizer.claims.sub,
          isBlocked: false,
          updatedAt: new Date().toISOString(),
          createdAt: new Date().toISOString(),
          status: "active",
        };
        console.log(itemData);
        console.log(marshall(itemData));
        const updateItemParams = new PutItemCommand({
          TableName: process.env.PROFILES_TABLE,
          Item: marshall(itemData),
        })
        console.log(updateItemParams);
        responseBody = await ddbClient
          .send(updateItemParams)
          .then((data) => {
            return data
          })
          .catch((error) => {
            console.log(error)
            throw error
          })
        statusCode = 201;
        break;
      case "PUT /users/profiles/{identifier}":
        const getItemCommand = new GetItemCommand({
          TableName: process.env.PROFILES_TABLE,
          Key: {
            "user_sub": {S: event.requestContext.authorizer.claims.sub},
            "identifier": {S: event.pathParameters.identifier},
          },
          ProjectionExpression: "identifier, user_sub, isBlocked, updatedAt, createdAt"
        });
        const updatableItem = await ddbClient
          .send(getItemCommand)
          .then((record) => {
            if (record.Item) {
              return unmarshall(record.Item);
            } else {
              statusCode = 404
              return {}
            }
          });
        if (!updatableItem) {
          throw new Error("Profile not found");
        } else if (updatableItem.isBlocked) {
          throw new Error(
            "This Profile has been blocked and you cannot update it"
          );
        }
        Object.assign(updatableItem, body);
        // update the dynamodb record using the updatabaleItem
        const updateItemCommand = new PutItemCommand({
          TableName: process.env.PROFILES_TABLE,
          Item: marshall(updatableItem),
        })
        responseBody = await ddbClient
          .send(updateItemCommand)
        break;
      case "DELETE /users/profiles/{identifier}":
        const deleteParam = new DeleteItemCommand({
          TableName: process.env.PROFILES_TABLE,
          Key: {
            identifier: event.pathParameters.identifier,
            user_sub: event.requestContext.authorizer.claims.sub,
          },
        });
        responseBody = await ddbClient
          .send(deleteParam)
          .then((data) => {
            unmarshall(data.Items);
          })
        break;
      default:
        throw new Error(`Unsupported route: "${route}"`);
    }
  } catch (err) {
    console.log({error: JSON.stringify(err)});
    statusCode = 400;
    responseBody = err.message;
  } finally {
    console.log({data: responseBody});
    responseBody = JSON.stringify(responseBody);
  }

  return {
    statusCode,
    body: responseBody,
  };
};