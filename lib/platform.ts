import core = require('@aws-cdk/core');
import ecr = require('@aws-cdk/aws-ecr')
import logs = require('@aws-cdk/aws-logs')
import ecs = require('@aws-cdk/aws-ecs')
import ec2 = require('@aws-cdk/aws-ec2');
import elbv2 = require('@aws-cdk/aws-elasticloadbalancingv2')
import route53 = require('@aws-cdk/aws-route53');
import { AutoScalingGroup } from '@aws-cdk/aws-autoscaling';
import { IConnectable, Vpc, Connections } from '@aws-cdk/aws-ec2';
import { Tag, CfnOutput } from '@aws-cdk/core';
import { Cluster } from '@aws-cdk/aws-ecs';
import * as cfn from "@aws-cdk/aws-cloudformation"
import { SingletonFunction, Runtime, Code } from '@aws-cdk/aws-lambda';
import * as cr from "@aws-cdk/custom-resources"
import { ContentType } from '@aws-cdk/aws-elasticloadbalancingv2';

export interface IHostable {
  id: string
}

export interface IOutboundConnection {
  allowIngressTo(connections: Connections) : void
  addRouteTo(key: string, value: string) : void
}

export interface IRoutable {
  route: string
}

export interface IDeployment extends IRoutable, IOutboundConnection {
  service: ecs.Ec2Service
  taskDefinition: ecs.Ec2TaskDefinition;
  logGroup: logs.LogGroup;
  canonicalName: string;
}


export interface IBuildable {
  imageRepository: ecr.Repository;
  canonicalName: string
}

export interface SiteRoot { hostAt: "root" }
export const SiteRoot : string = "www"

export class Platform extends core.Construct {
  zone: route53.PrivateHostedZone
  vpc: ec2.Vpc;
  cluster: ecs.Cluster;
  loadBalancer: elbv2.ApplicationLoadBalancer;
  listener: elbv2.ApplicationListener;

  private targetGroups = 0;

  private hostRecords: { [key: string]: IHostable; } = {}

  constructor(scope: core.Construct, id: string) {
    super(scope, id);


    this.vpc = this.createVpc(id);
    this.cluster = this.createEcsCluster(id, this.vpc)
    this.zone = this.createHostedZone(id, this.vpc);
    this.loadBalancer = this.createLoadBalancer(id, this.vpc, this.cluster);
    this.listener = this.createListener(id, this.loadBalancer)

    new CfnOutput(this, "PlatformOut", { exportName: "ClusterName", value: this.cluster.clusterName })
    new CfnOutput(this, "LoadBalancerOut", { exportName: "LoadBalancer", value: this.loadBalancer.loadBalancerFullName })
    
    // this.listener = this.loadBalancer.addListener(id + 'PublicListener', { port: 80, open: true });
  }

  consumePriority(): number {
    this.targetGroups += 1;
    return this.targetGroups;
  }


  link(consumer: IDeployment, provider: IRoutable, name: string) {
    const url = provider.route

    // if(!provider.connectable) throw "Error - Provider doesn't have connectable set"
    
    // provider.connectable.connections.allowDefaultPortFrom(consumer.service, "HERE2")

    if(url)
      consumer.addRouteTo(name, url)
    // else
    //   throw new Error("URL hasn't been defined, cannot link")
  }

  private createVpc(id: string) {
    const vpc = new ec2.Vpc(this, "VPC", {
      cidr: '108.0.0.0/16',
      natGateways: 1,
      subnetConfiguration: [
        {
          cidrMask: 24,
          name: 'ingress',
          subnetType: ec2.SubnetType.PUBLIC
        },
        {
          cidrMask: 24,
          name: 'application',
          subnetType: ec2.SubnetType.PRIVATE
        },
        {
          cidrMask: 28,
          name: 'data',
          subnetType: ec2.SubnetType.ISOLATED
        }
      ]
    });

    Tag.add(vpc, "MemberOf", "Platform")
    Tag.add(vpc, "Name", vpc.node.uniqueId)

    return vpc
  }

  private createLoadBalancer(id: string, vpc: ec2.Vpc, cluster : ecs.Cluster) {
    const lb = new elbv2.ApplicationLoadBalancer(this, "PublicALB", {
      vpc: vpc,
      internetFacing: true,
      loadBalancerName: id + "LoadBalancer",
    });

    lb.connections.allowTo(cluster.connections, ec2.Port.allTcp(), "Allow all outbound to ECS cluster")

    return lb
  }

  createListener(id: string, loadBalancer: elbv2.ApplicationLoadBalancer): elbv2.ApplicationListener {
    // const targetGroup = new elbv2.ApplicationTargetGroup(this, id + 'DefaultTargetGroup', {
    //   vpc: loadBalancer.vpc,
    //   port: 80,
    // });

    const listener = loadBalancer.addListener('Port80Listener', {
      port: 80,
      // defaultTargetGroups: [targetGroup],
      open: true,
    })

    listener.addFixedResponse("Fixed", {
      messageBody: "OK",
      statusCode: "200",
      contentType: ContentType.TEXT_PLAIN
    })

    return listener
  }

  private createHostedZone(id: string, vpc: ec2.Vpc): route53.PrivateHostedZone {
    return new route53.PrivateHostedZone(this, "HostedZone", {
      zoneName: "bankco.local",
      vpc: vpc
    });
  }

  createEcsCluster(id: string, vpc: ec2.Vpc): ecs.Cluster {
    const cluster = new ecs.Cluster(this, 'Cluster', { vpc, clusterName: id + 'Cluster' });

    const asg = new AutoScalingGroup(this, "ClusterCapacity", {
      vpc,
      instanceType: new ec2.InstanceType("t2.xlarge"),
      machineImage: new ecs.EcsOptimizedAmi(),
      desiredCapacity: 1,
      keyName: id + "KeyPair"
    })

    cluster.addAutoScalingGroup(asg)

    return cluster
  }

}


// export class ImportedPlatform extends core.Construct {
//   constructor(scope, id) {
//     this.vpc = ec2.Vpc.fromVpcAttributes(scope, id + "VPC", { })
//     this.cluster = ecs.Cluster.fromClusterAttributes(scope, id + "Cluster", {})
//     this.zone = route53.PrivateHostedZone.fromHostedZoneAttributes(scope, id + "HostedZone", {})
//     this.loadBalancer = elbv2.ApplicationLoadBalancer.fromApplicationLoadBalancerAttributes(scope, id + "PublicALB", {})
//     this.listener = elbv2.ApplicationListener.fromApplicationListenerAttributes(scope, id + "Listener", {})
//   }
// }