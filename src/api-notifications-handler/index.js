const ddbClient = new AWS.DynamoDB.DocumentClient();

exports.handler = async (event, context, callback) => {
  let body;
  let statusCode = 200;
  const headers = {
    "Content-Type": "application/json",
  };

  let path = event.resource;
  let httpMethod = event.httpMethod;
  let route = httpMethod.concat(" ").concat(path);

  try {
    switch (route) {
      case "GET /users/notifications":
        console.log({
          message: "Retrieving notification record from dynamodb table",
        });
        const getParams = {
          TableName: process.env.NOTIFICATION_TABLE,
          Key: {
            user_sub: event.pathParameters.user_sub,
          },
        };
        body = await ddbClient.get(getParams).promise();
        break;
      // Create a new notification (review to delete)
      case "POST /users/notifications":
        const data = JSON.parse(event.body);
        const putParams = {
          TableName: process.env.NOTIFICATION_TABLE,
          Item: {
            user_sub: data.user_sub,
            notification_id: data.notification_id,
            created_at: new Date().toISOString(),
            readed_at: "-",
            deleted_at: "-",
            isRead: false,
            isDelete: false,
          },
        };
        console.log({message: "Inserting..."});
        await ddbClient.put(putParams).promise();
        console.log({message: "Inserted Successfully"});
        body = "Records Inserted Successfully...";
        break;
      // Update all notifications for a user
      case "PUT /user/notification":
        console.log({
          message: "Retrieving notification record from dynamodb table",
        });
        const updateReadParams = {
          TableName: process.env.NOTIFICATION_TABLE,
          KeyConditionExpression: "#user_sub = :user_sub",
          ExpressionAttributeNames: {
            "#user_sub": "user_sub",
          },
          ExpressionAttributeValues: {
            ":user_sub": event.pathParameters.user_sub,
          },
        };
        await ddbClient
          .query(updateReadParams, async function (err, data) {
            if (data) {
              data.Items.forEach(async (record) => {
                if (!record.isRead) {
                  record.readed_at = new Date().toISOString();
                  record.isRead = true;
                  const updateReadParam = {
                    TableName: process.env.NOTIFICATION_TABLE,
                    Item: record,
                  };
                  await ddbClient.put(updateReadParam).promise();
                }
              });
            }
          })
          .promise();
        body = "Records Updated Successfully...";
        break;
      // Mark all notifications as deleted for a user
      case "DELETE /user/notifications":
        console.log({
          message:
            "Retrieving notification record from dynamodb table for soft delete",
        });
        const updateDeleteparams = {
          TableName: process.env.NOTIFICATION_TABLE,
          KeyConditionExpression: "#user_sub = :user_sub",
          ExpressionAttributeNames: {
            "#user_sub": "user_sub",
          },
          ExpressionAttributeValues: {
            ":user_sub": event.pathParameters.user_sub,
          },
        };
        const res = await ddbClient.query(updateDeleteparams).promise();
        if (res) {
          console.log("Data Found", res);
          res.Items.forEach(async (record) => {
            console.log("Record: ", record);
            if (!record.isDelete) {
              console.log(record.isDelete);
              record.deleted_at = new Date().toISOString();
              record.isDelete = true;
              console.log("Updated Record: ", record);
              const updateDeleteParam = {
                TableName: process.env.NOTIFICATION_TABLE,
                Item: record,
              };
              await ddbClient.put(updateDeleteParam).promise();
            }
          });
        }
        body = "Records Updated Successfully...";
        break;
      // Retrieve a single notification
      case "GET /users/notifications/{notification_id}":
        console.log({
          message: "Retrieving notification record from dynamodb table",
        });
        const params = {
          TableName: process.env.NOTIFICATION_TABLE,
          Key: {
            user_sub: event.pathParameters.user_sub,
            notification_id: event.pathParameters.notification_id,
          },
        };
        body = await ddbClient.get(params).promise();
        break;
      // Update a single notification
      case "PUT /users/notifications/{notification_id}":
        console.log({
          message: "Retrieving notification record from dynamodb table",
        });
        const getparams = {
          TableName: process.env.NOTIFICATION_TABLE,
          Key: {
            user_sub: event.pathParameters.user_sub,
            notification_id: event.pathParameters.notification_id,
          },
        };
        const record = await ddbClient.get(getparams).promise();
        record.Item.readed_at = new Date().toISOString();
        record.Item.isRead = true;
        const param = {
          TableName: process.env.NOTIFICATION_TABLE,
          Item: record.Item,
        };
        await ddbClient.put(param).promise();
        break;
      // Mark one notification as deleted
      case "DELETE /user/notifications/{notification_id}":
        console.log({
          message: "Retrieving notification record from dynamodb table",
        });
        const getparam = {
          TableName: process.env.NOTIFICATION_TABLE,
          Key: {
            user_sub: event.pathParameters.user_sub,
            notification_id: event.pathParameters.notification_id,
          },
        };
        const response = await ddbClient.get(getparam).promise();
        response.Item.deleted_at = new Date().toISOString();
        response.Item.isDelete = true;
        const deleteParam = {
          TableName: process.env.NOTIFICATION_TABLE,
          Item: response.Item,
        };
        await ddbClient.put(deleteParam).promise();
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
    headers,
  };
};
