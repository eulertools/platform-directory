import { appConfig } from "../config";
import { execSync } from "child_process";


const {config} = appConfig();

const validateRestApiName = async (region: string): Promise<number> => {
  const apigateway = new AWS.APIGateway({region});
  return new Promise<number>((resolve, reject) => {
    let result;
    apigateway.getDomainNames(function (err: any, data: any) {
      let match;
      if (err) reject(err.stack);
      else {
        const values = data.items.map((i: any) => i.domainName);
        match = values.find((element: any) => {
          if (element.includes(config.directoryApiName)) {
            return true;
          } else if (element.includes(config.notificationApiName)) {
            return true;
          } else {
            return false;
          }
        });
      }
      if (match) {
        result = 0;
      } else {
        result = 1;
      }
      resolve(result);
    });
  });
};

const validateCognitoPoolDomainName = async (
  domainName: string,
  region: string,
  hostedZone: string
): Promise<number> => {
  const cognito = new AWS.CognitoIdentityServiceProvider({
    region,
  });
  var params = {
    Domain: `${domainName}.${hostedZone}`,
  };
  let result: any;
  return new Promise<number>((resolve, reject) => {
    cognito.describeUserPoolDomain(params, function (err: any, data: any) {
      if (err) {
        reject(err.stack);
      } else {
        if (data && Object.keys(data.DomainDescription).length === 0) {
          result = true;
        } else {
          result = false;
        }
      }
      resolve(result);
    });
  });
};

async function validateDirectoryProps() {
  const domainName = config.domainName;
  const region = config.region;
  const hostedZone = config.hostedZone;
  return new Promise<string>((resolve, reject) => {
    validateCognitoPoolDomainName(domainName, region, hostedZone).then(
      (data) => {
        if (!data) {
          reject("Provided Cognito Pool Domain Name Is Already Exists!");
        } else {
          validateRestApiName(region).then((data) => {
            if (!data) {
              reject("Provided Rest API Domain Name Is Already Exists!");
            } else {
              resolve("true");
            }
          });
        }
      }
    );
  });
}

validateDirectoryProps()
  .then((data) => {
    if (data === "true") {
      console.log(data);

      // execSync(`cd ../../ && cdk deploy ${config.stackName} --profile dev`, { encoding: "utf-8" });
    } else {
      console.log(data);
    }
  })
  .catch((err) => {
    console.log(err);
  });
