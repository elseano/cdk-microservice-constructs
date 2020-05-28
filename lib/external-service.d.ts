import * as cdk from '@aws-cdk/core';
import { Platform, IRoutable } from './platform';
import { IConnectable, InterfaceVpcEndpoint, IVpc } from '@aws-cdk/aws-ec2';
export declare class ExternalService extends cdk.Construct {
    private readonly id;
    private readonly vpc;
    connectable: IConnectable;
    interfaceEndpoint: InterfaceVpcEndpoint;
    constructor(scope: cdk.Construct, id: string, vpc: IVpc, name: string);
    deployTo(platform: Platform, subdomain: string): IRoutable;
}
