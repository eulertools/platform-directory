const AWS = require("aws-sdk");
AWS.config.update({region: process.env.AWS_REGION});

const ddbClient = new AWS.DynamoDB.DocumentClient();

exports.handler = async (event, context, callback) => {
  let body;
  let statusCode = 200;
  const headers = getHeaders(event);

  let path = event.resource;
  let httpMethod = event.httpMethod;
  let route = httpMethod.concat(" ").concat(path);

  try {
    switch (route) {
      case "POST /alerts":
        const alertsData = JSON.parse(event.body);
        const putParams = {
          TableName: process.env.ALERTS_TABLE,
          Item: {
            address: alertsData.address,
            chain_id: alertsData.chain_id,
            user_sub: alertsData.user_sub,
            created_at: new Date().toISOString(),
            deleted_at: "-",
            isDelete: false,
          },
        };
        try {
          console.log({message: "Inserting"});
          await ddbClient.put(putParams).promise();
          console.log({message: "Inserted Successfully"});
          body = "Records Inserted Successfully";
        } catch (err) {
          console.log({
            message: "Failed while inserting alerts, error occured: ",
            error: JSON.stringify(err),
          });
          statusCode = 400;
          body = err.message;
        }
        break;
      case "GET /alerts":
        try {
          body = await ddbClient
            .scan({TableName: process.env.ALERTS_TABLE})
            .promise()
            .then((res) => {
              return res.Items;
            });
        } catch (err) {
          console.log({
            message: "Failed while retrieveing alerts, error occured: ",
            error: JSON.stringify(err),
          });
          statusCode = 400;
          body = err.message;
        }
        break;
      case "GET /alerts/{address}":
        const getOneQueryString = event.queryStringParameters;
        if (getOneQueryString) {
          try {
            const readOneAlertsParams = {
              TableName: process.env.ALERTS_TABLE,
              KeyConditionExpression:
                "#address = :address and #chain_id = :chain_id",
              ExpressionAttributeNames: {
                "#address": "address",
                "#chain_id": "chain_id",
              },
              ExpressionAttributeValues: {
                ":address": event.pathParameters.address,
                ":chain_id": getOneQueryString.chain_id,
              },
            };
            const items = await ddbClient
              .query(readOneAlertsParams)
              .promise()
              .then((res) => {
                return res.Items;
              });
            if (!getOneQueryString.user_sub) {
              body = items;
            } else {
              const result = items.filter((item) => {
                return item.user_sub === getOneQueryString.user_sub;
              });
              if (result.length === 0) {
                throw {
                  message: `Unable to retrieve the alerts, provided user_sub ${getOneQueryString.user_sub} is not valid.`,
                };
              } else {
                body = result;
              }
            }
          } catch (err) {
            console.log({
              message: "Failed while retrieveing Alerts, error occured: ",
              error: JSON.stringify(err),
            });
            statusCode = 400;
            body = err.message;
          }
        } else {
          try {
            const readAlertsParams = {
              TableName: process.env.ALERTS_TABLE,
              KeyConditionExpression: "#address = :address",
              ExpressionAttributeNames: {
                "#address": "address",
              },
              ExpressionAttributeValues: {
                ":address": event.pathParameters.address,
              },
            };
            body = await ddbClient.query(readAlertsParams).promise();
          } catch (err) {
            console.log({
              message: "Failed while retrieveing Alerts, error occured: ",
              error: JSON.stringify(err),
            });
            statusCode = 400;
            body = err.message;
          }
        }
        break;
      case "PUT /alerts/{address}":
        const putQueryString = event.queryStringParameters;
        const data = JSON.parse(event.body);
        if (data.chain_id || data.address || data.user_sub) {
          throw {
            message: `You are not authorized to update the chain_id, user_sub, address fields`,
          };
        }
        try {
          const getAlertsParams = {
            TableName: process.env.ALERTS_TABLE,
            KeyConditionExpression:
              "#address = :address and #chain_id = :chain_id ",
            ExpressionAttributeNames: {
              "#address": "address",
              "#chain_id": "chain_id",
            },
            ExpressionAttributeValues: {
              ":address": event.pathParameters.address,
              ":chain_id": putQueryString.chain_id,
            },
          };
          const items = await ddbClient
            .query(getAlertsParams)
            .promise()
            .then((record) => {
              return record.Items;
            });
          try {
            const filteredData = items.filter((item) => {
              return item.user_sub === putQueryString.user_sub;
            });
            filteredData.forEach(async (item) => {
              Object.assign(item, data);
              await ddbClient
                .put({
                  TableName: process.env.ALERTS_TABLE,
                  Item: item,
                })
                .promise();
            });
            body = "Alerts updated successfully";
          } catch (err) {
            throw err;
          }
        } catch (err) {
          console.log({
            message: "Failed while updating Alerts, error occured: ",
            error: JSON.stringify(err),
          });
          statusCode = 400;
          body = err.message;
        }
        break;
      case "DELETE /alerts/{address}":
        const delQueryString = event.queryStringParameters;
        try {
          const updateDeleteparams = {
            TableName: process.env.ALERTS_TABLE,
            KeyConditionExpression:
              "#address = :address and #chain_id = :chain_id",
            ExpressionAttributeNames: {
              "#address": "address",
              "#chain_id": "chain_id",
            },
            ExpressionAttributeValues: {
              ":address": event.pathParameters.address,
              ":chain_id": delQueryString.chain_id,
            },
          };
          const res = await ddbClient.query(updateDeleteparams).promise();
          if (res) {
            try {
              const data = res.Items.filter((item) => {
                return item.user_sub === delQueryString.user_sub;
              });
              const promises = data.forEach(async (record) => {
                if (!record.isDelete) {
                  record.deleted_at = new Date().toISOString();
                  record.isDelete = true;
                  const updateDeleteParam = {
                    TableName: process.env.ALERTS_TABLE,
                    Item: record,
                  };
                  await ddbClient.put(updateDeleteParam).promise();
                }
              });
              await Promise.all(promises);
              body = "Records Deleted Successfully";
            } catch (err) {
              throw err;
            }
          }
        } catch (err) {
          console.log({
            message: "Failed while deleting Alerts, error occured: ",
            error: JSON.stringify(err),
          });
          statusCode = 400;
          body = err.message;
        }
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
}
