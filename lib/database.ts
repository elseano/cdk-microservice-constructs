import * as core from '@aws-cdk/core';
import * as rds from "@aws-cdk/aws-rds"
import * as cfn from "@aws-cdk/aws-cloudformation"
import * as sm from "@aws-cdk/aws-secretsmanager"
import { RemovalPolicy, cfnTagToCloudFormation } from '@aws-cdk/core';
import { InstanceType } from '@aws-cdk/aws-ec2';
import { Platform, IDeployment, IRoutable, IOutboundConnection } from './platform';
import { DeliveryPipeline } from './delivery-pipeline';

export interface DatabaseProps {
  name: string
  instanceClass: InstanceType
  username?: string
}

export class Database extends core.Construct {
  private readonly database: rds.DatabaseInstance;
  private readonly databaseName: string;

  constructor(scope: core.Construct, id: string, platform: Platform, props: DatabaseProps) {
    super(scope, id)

    this.databaseName = props.name || "data"

    this.database = new rds.DatabaseInstance(this, "RDS", {
      databaseName: this.databaseName,
      engine: rds.DatabaseInstanceEngine.POSTGRES,
      engineVersion: "11.5",
      removalPolicy: RemovalPolicy.DESTROY,
      masterUsername: props.username || "dbadmin",
      vpc: platform.vpc,
      instanceClass: props.instanceClass,
      enablePerformanceInsights: true,
      multiAz: false,
      instanceIdentifier: props.name,
      deletionProtection: false
    })
  }

  grantAccess(target: IOutboundConnection, name: string) {
    target.allowIngressTo(this.database.connections)

    target.addRouteTo(name, core.Lazy.stringValue({
      produce: () => {
        if(this.database.secret)
        {
          const username = this.database.secret.secretValueFromJson("username")
          const password = this.database.secret.secretValueFromJson("password")

          return `postgres://${username}:${password}@${this.database.instanceEndpoint.socketAddress}/${this.databaseName}`
        }
        else
          return "ERROR - No database secret available"
      }
    }))
  }
}
