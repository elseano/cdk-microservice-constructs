import * as core from '@aws-cdk/core';
import * as ecs from '@aws-cdk/aws-ecs';
import * as ecr from '@aws-cdk/aws-ecr';
import * as iam from '@aws-cdk/aws-iam';
import * as logs from "@aws-cdk/aws-logs"
import * as elbv2 from "@aws-cdk/aws-elasticloadbalancingv2"
import * as route53 from "@aws-cdk/aws-route53"
import { IHostable, IBuildable, Platform, SiteRoot, IDeployment } from './platform';
import { Ec2HealthCheckOptions } from '@aws-cdk/aws-autoscaling';
import { IConnectable, Connections } from '@aws-cdk/aws-ec2';
import { ApplicationProtocol, ApplicationListener, ApplicationTargetGroup } from '@aws-cdk/aws-elasticloadbalancingv2';
import { RemovalPolicy, Lazy, CfnOutput } from '@aws-cdk/core';

export class Microservice extends core.Construct implements IHostable, IBuildable {

  imageRepository: ecr.Repository;
  allowIngress: Array<Connections> = []

  constructor(scope: core.Construct, readonly id: string, readonly canonicalName: string, readonly healthRoute: string) {
    super(scope, id)

    this.imageRepository = new ecr.Repository(scope, "Repository", { 
      repositoryName: this.canonicalName.toLowerCase(),
      removalPolicy: RemovalPolicy.DESTROY
    })

    new CfnOutput(this, "RepositoryOut", { exportName: this.canonicalName + "ContainerRepository", value: this.imageRepository.repositoryUri })
  }

  allowIngressTo(connections : Connections) {
    this.allowIngress.push(connections)
  }

  deployTo(platform: Platform, subdomain: string | SiteRoot) : IDeployment {
    const environment: { [key: string]: string; } = {}
    const addRouteTo = function(key: string, value: string) : void {
      environment[key] = value
    }

    const logGroup = new logs.LogGroup(this, "LogGroup", { logGroupName: `${platform.cluster.clusterName}/${this.canonicalName}/${subdomain}`, removalPolicy: RemovalPolicy.DESTROY })

    new CfnOutput(this, "LogGroupOut", { exportName: this.canonicalName + "LogGroup", value: logGroup.logGroupName })

    const taskDefinition = new ecs.Ec2TaskDefinition(this, "TaskDefinition", {
      networkMode: ecs.NetworkMode.BRIDGE,
    });

    logGroup.grantWrite(taskDefinition.taskRole)
    taskDefinition.taskRole.addManagedPolicy(iam.ManagedPolicy.fromAwsManagedPolicyName("AWSXRayDaemonWriteAccess"))

    const bankContainer = taskDefinition.addContainer("ServiceContainer", {
      image: new ecs.EcrImage(this.imageRepository, "latest"),
      memoryLimitMiB: 200,
      environment,
      logging: new ecs.AwsLogDriver({ streamPrefix: this.canonicalName, logGroup }),
      essential: true
    })

    bankContainer.addPortMappings({ 
      containerPort: 3000,
      protocol: ecs.Protocol.TCP
     })

    const xrayContainer = taskDefinition.addContainer("XRay", {
      image: ecs.ContainerImage.fromRegistry("amazon/aws-xray-daemon"),
      cpu: 32,
      memoryReservationMiB: 256,
      logging: new ecs.AwsLogDriver({ streamPrefix: "xray", logGroup }),
      environment: { "AWS_REGION": core.Stack.of(this).region }
    })

    xrayContainer.addPortMappings({
      containerPort: 2000,
      protocol: ecs.Protocol.UDP
    })

    bankContainer.addLink(xrayContainer, "xray")

    addRouteTo("AWS_XRAY_DAEMON_ADDRESS", "xray:2000")

    const service = new ecs.Ec2Service(this, "Service", {
      cluster: platform.cluster,
      taskDefinition,
      serviceName: this.canonicalName,
      desiredCount: 0   // Because ECS and CloudFormation haven't been friends for years.
    })

    new CfnOutput(this, "ServiceArn", { exportName: this.canonicalName + "ServiceArn", value: service.serviceArn })

    // Breaks reference, forcing listener to appear in Microserive stack instead of Platform stack.
    const listener = ApplicationListener.fromApplicationListenerAttributes(this, "PlatformReference", {
      listenerArn: platform.listener.listenerArn,
      securityGroupId: platform.listener.connections.securityGroups[0].securityGroupId
    })

    const tg = new ApplicationTargetGroup(this, "ApplicationTargetGroup", {
      port: 80, // Ignored, as we're using Dynamic Port Mapping
      protocol: ApplicationProtocol.HTTP,
      targets: [service],
      vpc: platform.vpc,
      // targetGroupName: this.canonicalName,   // Disabled as CFN can't manage updates of named resources (WTF)
      healthCheck: {
        path: this.healthRoute
      }
    })

    if(subdomain === SiteRoot) {
      listener.addTargetGroups("TargetGroupAddition", {
        targetGroups: [tg],
        priority: 500,
        pathPattern: "*",
      })
    }
    else
    {
      listener.addTargetGroups("TargetGroupAddition", {
        targetGroups: [tg],
        priority: platform.consumePriority() * 10,
        hostHeader: subdomain + ".bankco.local",
      })
    }

    const route = new route53.CnameRecord(this, "Subdomain", {
      recordName: subdomain === SiteRoot ? "www" : `${subdomain}`,
      zone: platform.zone,
      domainName: platform.listener.loadBalancer.loadBalancerDnsName
    })

    new CfnOutput(this, "Route", { exportName: this.canonicalName + "Route", value: route.domainName })

    const allowIngressTo = function(connections : Connections) : void {
      connections.allowDefaultPortFrom(service)
    }

    addRouteTo("SELF_URL", route.domainName)

    return {
      service,
      route: route.domainName,
      taskDefinition,
      logGroup,
      canonicalName: this.canonicalName,
      addRouteTo,
      allowIngressTo
    }

  }


}