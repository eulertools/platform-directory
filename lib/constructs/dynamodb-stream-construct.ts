import {Duration, Stack, StackProps, RemovalPolicy} from "aws-cdk-lib";
import {Construct} from "constructs";
import * as kinesis from "aws-cdk-lib/aws-kinesis";
import * as dynamodb from "aws-cdk-lib/aws-dynamodb";
import * as ssm from "aws-cdk-lib/aws-ssm";

export interface ConstructProps extends StackProps {
  tableName: string;
  partitionKey: string;
  sortKey: string;
}

export class DynamoStreamConstruct extends Construct {
  public readonly table: dynamodb.Table;
  public readonly stream: kinesis.Stream;

  constructor(stack: Construct, id: string, props?: ConstructProps) {
    super(stack, id);

    const {partitionKey, sortKey} = props!
    let {tableName} = props!;

    tableName = tableName.charAt(0).toUpperCase() + tableName.slice(1)

    const stream = new kinesis.Stream(
      this,
      `${tableName}Stream`,
      {
        shardCount: 1,
        retentionPeriod: Duration.hours(24),
      }
    );

    const table = new dynamodb.Table(this, tableName, {
      removalPolicy: RemovalPolicy.DESTROY,
      partitionKey: {
        name: partitionKey,
        type: dynamodb.AttributeType.STRING,
      },
      sortKey: {
        name: sortKey,
        type: dynamodb.AttributeType.STRING,
      },
      billingMode: dynamodb.BillingMode.PROVISIONED,
      stream: dynamodb.StreamViewType.NEW_AND_OLD_IMAGES,
      kinesisStream: stream,
    });

    this.table = table;

    this.stream = stream;

    new ssm.StringParameter(this, `ssm-${tableName}-table-output`, {
      stringValue: table.tableArn,
      parameterName: `/directory/table/${tableName}-table-arn`,
    });

    new ssm.StringParameter(this, `ssm-${tableName}-stream-output`, {
      stringValue: stream.streamArn,
      parameterName: `/directory/stream/${tableName}-events-stream-arn`,
    });
  }
}
