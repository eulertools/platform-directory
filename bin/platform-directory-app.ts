#!/usr/bin/env node
import "source-map-support/register";
import * as cdk from "aws-cdk-lib";
import { Directory } from "../lib/stacks/platform-directory-stack";
import { appConfig } from "../lib/config";
import { PlatformDirectoryCognitoUIStack } from "../lib/stacks/platform-directory-cognito-ui-stack";
import { DirectorySharedResources } from "../lib/stacks/platform-directory-shared-stack";

const {config} = appConfig();

const app = new cdk.App();

const hostedZone = "pox.me"

const {certificateSsm} = new DirectorySharedResources(app, "DirectoryCertificates", {
  hostedZone,
  description: "Shared resources for the cognito portal on all other regions",
  env: {
    account: process.env.CDK_DEFAULT_ACCOUNT,
    region: "us-east-1",
  },
  tags: {app: "platform", domain: "pox.me", owner: "pox.me"}
});

const directory = new Directory(app, "PlatformDirectory", {
  cognitoStack: true,
  certificateSsm,
  clientName: config.clientName,
  hostedZone,
  domainName: config.domainName,
  notifications: false,
  alerts: false,
  directoryApiStack: false,
  description: "The Directory is the core of the platform authentication, never, ever, touch it",
  env: {
    account: process.env.CDK_DEFAULT_ACCOUNT,
    region: process.env.CDK_DEFAULT_REGION,
  },
  tags: {app: "platform", domain: "pox.me", owner: "pox.me"}
});


/*
new PlatformDirectoryCognitoUIStack(app, "DirectoryUSW", {
  userPool: directory.userPool,
  userPoolClient: directory.userPoolClient,
  userPoolDomain: directory.userPoolDomain,
  env: {
    account: process.env.CDK_DEFAULT_ACCOUNT,
    region: process.env.CDK_DEFAULT_REGION,
  },
});
*/
