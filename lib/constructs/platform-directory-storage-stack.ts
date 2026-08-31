import { Duration, Stack, StackProps } from "aws-cdk-lib";
import { Construct } from "constructs";
import { DynamoStreamConstruct } from "../constructs/dynamodb-stream-construct";
import * as dynamodb from "aws-cdk-lib/aws-dynamodb";
import * as kinesis from "aws-cdk-lib/aws-kinesis";
import * as ssm from "aws-cdk-lib/aws-ssm";

interface AppStackProps extends StackProps {
  clientName: string;
}

export class PlatformDirectoryStorageStack extends Construct {
  public readonly userSubscriptionTable: dynamodb.Table;
  public readonly subscriptionSettingsTable: dynamodb.Table;
  public readonly userProfilesTable: dynamodb.Table;
  public readonly userEntitiesTable: dynamodb.Table;
  public readonly userNotificationTable: dynamodb.Table;
  public readonly userNotificationStream: kinesis.Stream;
  constructor(scope: Stack, id: string, props?: AppStackProps) {
    super(scope, id);

    const { clientName } = props!;

    const { table } = new DynamoStreamConstruct(
      this,
      `${clientName}-user-subscriptions-table`,
      {
        tableName: `${clientName}-user-subscriptions`,
        partitionKey: "user_sub",
        sortKey: "identifier",
      }
    );

    table.addGlobalSecondaryIndex({
      indexName: `${clientName}_subscriptions_index`,
      partitionKey: { name: "identifier", type: dynamodb.AttributeType.STRING },
      sortKey: { name: "expired_at", type: dynamodb.AttributeType.STRING },
      projectionType: dynamodb.ProjectionType.ALL,
    });

    this.userSubscriptionTable = table;

    const subscriptionSettingsTable = new DynamoStreamConstruct(
      this,
      `${clientName}-subscriptions-settings-table`,
      {
        tableName: `${clientName}-subscriptions-settings`,
        partitionKey: "owner",
        sortKey: "identifier",
      }
    );

    this.subscriptionSettingsTable = subscriptionSettingsTable.table;

    const userProfilesTable = new DynamoStreamConstruct(
      this,
      `${clientName}-user-profiles-table`,
      {
        tableName: `${clientName}-user-profiles`,
        partitionKey: "user_sub",
        sortKey: "identifier",
      }
    );

    this.userProfilesTable = userProfilesTable.table;

    const userEntitiesTable = new DynamoStreamConstruct(
      this,
      `${clientName}-user-entities-table`,
      {
        tableName: `${clientName}-user-entities`,
        partitionKey: "user_sub",
        sortKey: "identifier",
      }
    );

    this.userEntitiesTable = userEntitiesTable.table;

    const userNotificationTable = new DynamoStreamConstruct(
      this,
      `${clientName}-user-notifications-table`,
      {
        tableName: `${clientName}-user-notifications`,
        partitionKey: "user_sub",
        sortKey: "notification_id",
      }
    );

    this.userNotificationTable = userNotificationTable.table;

    this.userNotificationStream = userNotificationTable.stream;

    const userEventStream = new kinesis.Stream(
      this,
      `${clientName}-users-events-stream`,
      {
        streamName: `${clientName}-users-events`,
        shardCount: 1,
        retentionPeriod: Duration.hours(24),
      }
    );

    new ssm.StringParameter(this, `${clientName}-users-events-stream-db`, {
      stringValue: userEventStream.streamName,
      parameterName: `/directory/${clientName}/stream/users-events-stream-arn`,
    });
  }
}
