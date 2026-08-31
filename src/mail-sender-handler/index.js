const hostedZone = process.env.HOSTED_ZONE || "";

const ses = new AWS.SES({region: process.env.AWS_REGION});

exports.handler = async (event, context, callback) => {
  console.log({message: "Retrieving records from SQS Queue..."});

  try {
    const eventData = event.Records.map((data) => {
      const email = data.Sns.Message;
      return JSON.parse(email).user_email;
    });

    // replace with fetch the previous statement
    const data = await fetch(
      `https://assets.communications.${hostedZone}/euler-tools-emails/template_body/welcome-message-body.txt`
    ).then((res) => {
      return res.text();
    })

    console.log("DATA: ", data);

    const params = {
      Destination: {
        ToAddresses: [eventData[0]],
      },
      Template: "welcome-message",
      TemplateData: JSON.stringify({
        welcome_message: data.welcome_message,
        message_body: data.message_body,
        steps_content_1: data.steps_content_1,
        steps_content_2: data.steps_content_2,
        steps_content_3: data.steps_content_3,
      }),
      Source: "no-reply@dev.euler.tools",
    };
    console.log({message: "Sending email..."});
    await ses
      .sendTemplatedEmail(params)
      .promise()
      .catch((err) => {
        console.log("Err: ", err);
      });
    console.log({message: "Email sent successfully...."});
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
}
