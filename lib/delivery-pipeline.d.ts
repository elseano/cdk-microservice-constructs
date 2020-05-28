import * as core from '@aws-cdk/core';
import * as iam from '@aws-cdk/aws-iam';
import { BuildEnvironmentVariable } from '@aws-cdk/aws-codebuild';
import { IBuildable, IDeployment, Platform, IOutboundConnection } from './platform';
import { Connections } from '@aws-cdk/aws-ec2';
export declare class DeliveryPipeline extends core.Construct implements IOutboundConnection {
    private readonly scope;
    private readonly id;
    private readonly platform;
    private readonly buildTarget;
    environmentVariables: {
        [key: string]: BuildEnvironmentVariable;
    };
    buildRole: iam.IRole;
    buildSecurityGroup: any;
    allowIngress: Array<Connections>;
    constructor(scope: core.Construct, id: string, platform: Platform, buildTarget: IBuildable & IDeployment);
    setup(): void;
    addRouteTo(name: string, value: string): void;
    allowIngressTo(connections: Connections): void;
}
