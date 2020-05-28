import core = require('@aws-cdk/core');
import ecr = require('@aws-cdk/aws-ecr');
import logs = require('@aws-cdk/aws-logs');
import ecs = require('@aws-cdk/aws-ecs');
import ec2 = require('@aws-cdk/aws-ec2');
import elbv2 = require('@aws-cdk/aws-elasticloadbalancingv2');
import route53 = require('@aws-cdk/aws-route53');
import { Connections } from '@aws-cdk/aws-ec2';
export interface IHostable {
    id: string;
}
export interface IOutboundConnection {
    allowIngressTo(connections: Connections): void;
    addRouteTo(key: string, value: string): void;
}
export interface IRoutable {
    route: string;
}
export interface IDeployment extends IRoutable, IOutboundConnection {
    service: ecs.Ec2Service;
    taskDefinition: ecs.Ec2TaskDefinition;
    logGroup: logs.LogGroup;
    canonicalName: string;
}
export interface IBuildable {
    imageRepository: ecr.Repository;
    canonicalName: string;
}
export interface SiteRoot {
    hostAt: "root";
}
export declare const SiteRoot: string;
export declare class Platform extends core.Construct {
    zone: route53.PrivateHostedZone;
    vpc: ec2.Vpc;
    cluster: ecs.Cluster;
    loadBalancer: elbv2.ApplicationLoadBalancer;
    listener: elbv2.ApplicationListener;
    private targetGroups;
    private hostRecords;
    constructor(scope: core.Construct, id: string);
    consumePriority(): number;
    link(consumer: IDeployment, provider: IRoutable, name: string): void;
    private createVpc;
    private createLoadBalancer;
    createListener(id: string, loadBalancer: elbv2.ApplicationLoadBalancer): elbv2.ApplicationListener;
    private createHostedZone;
    createEcsCluster(id: string, vpc: ec2.Vpc): ecs.Cluster;
}
