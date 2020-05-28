# CDK Microservice Construct Library (WIP)

A higher level Construct library providing constructs to help build out containerized microservices, CI/CD pipelines, and supporting infrastructure elements.

Currently a WIP, however also serves as a good reference point for CDK usage examples.

Microservices follow an opinionated style of:

- Configuration passed in via environment variables.
- APM via XRay (sideloaded)
- Subdomain based routing (path based coming)

## Constructs:

- Platform - An ECS microservices platform. Sets up ECS cluster, shared load balancer, DNS routes, VPC.
- Database - Sets up a PostgreSQL database, and manages for microservices.
- Microservice - Sets up a ECR repository, ECS Tasks & Service, and ALB target groups.
- DeliveryPipeline - Sets up CodeCommit repository, CodePipeline, with CodeBuild. Works with Microservice to provide a full CI/CD stack.
- ExternalService - Sets up VPC PrivateLink InterfaceEndpoint to other services running in alternate VPC's or Accounts.

# Usage

Currently, I use this construct library from within a Stack file. I think of a Stack as either per microservice, or bounded context, depending on the situation.

For example, to deploy a website microservice, I'd have the following stacks within my CDK app:

- Platform Stack
  - Platform Construct.
- FrontEnd Stack
  - Database Construct
  - Microservice Construct
  - Delivery Pipeline Construct

A platform stack might look like this:

```typescript
import * as core from "@aws-cdk/core";
import { Platform } from "./constructs/platform";
import { CfnOutput } from "@aws-cdk/core";
import { Vpc } from "@aws-cdk/aws-ec2";
import { EcsOptimizedAmi, Cluster } from "@aws-cdk/aws-ecs";

export class PlatformStack extends core.Stack {
  readonly platform: Platform;
  readonly id: string;

  constructor(scope: core.Construct, id: string, props?: core.StackProps) {
    super(scope, id, props);

    this.platform = new Platform(this, "Cluster");
    this.id = id;

    new CfnOutput(this, id + "VpcOut", { value: this.platform.vpc.vpcId });
    new CfnOutput(this, id + "ClusterOut", {
      value: this.platform.cluster.clusterArn,
    });
    new CfnOutput(this, id + "PublicDNS", {
      value: this.platform.loadBalancer.loadBalancerDnsName,
    });
  }
}
```

While a microservice construct might look like this:

```typescript
import * as core from '@aws-cdk/core';
import { Platform, SiteRoot, IDeployment } from "./constructs/platform"
import { Microservice } from './constructs/microservice';
import { ExternalService } from './constructs/external-service';
import { DeliveryPipeline } from './constructs/delivery-pipeline';
import { MainframeStack } from './mainframe-stack';
import { Database } from './constructs/database';
import { InstanceType, InstanceClass, InstanceSize } from "@aws-cdk/aws-ec2"

export class SiteStack extends core.Stack {

  private platform: Platform
  private accounts: Microservice

  static DATABASE_INSTANCE_SIZE = InstanceType.of(InstanceClass.M5, InstanceSize.LARGE)
  deployment: IDeployment;

  constructor(scope: core.Construct, id: string, platform: Platform, props?: core.StackProps) {
    super(scope, id, props);

    this.platform = platform

    const webBackend = new Microservice(this, "Service", "Site", "/health")
    const webDb = new Database(this, "Database", platform, {
      name: "WebSite",
      instanceClass: SiteStack.DATABASE_INSTANCE_SIZE
    })

    // Sets up target group on the platform's ALB under "www" route.
    this.deployment = webBackend.deployTo(platform, "www")

    const pipeline = new DeliveryPipeline(this, "SiteDelivery", platform, { ...this.deployment, ...webBackend })

    // Allow the web microservice to access the database.
    webDb.grantAccess(this.deployment, "DATABASE_URL")

    // Allow the build pipeline to access the database to run migrations.
    webDb.grantAccess(pipeline, "DATABASE_URL")

    pipeline.setup()
  }
```
