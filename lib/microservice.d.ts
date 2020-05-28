import * as core from '@aws-cdk/core';
import * as ecr from '@aws-cdk/aws-ecr';
import { IHostable, IBuildable, Platform, SiteRoot, IDeployment } from './platform';
import { Connections } from '@aws-cdk/aws-ec2';
export declare class Microservice extends core.Construct implements IHostable, IBuildable {
    readonly id: string;
    readonly canonicalName: string;
    readonly healthRoute: string;
    imageRepository: ecr.Repository;
    allowIngress: Array<Connections>;
    constructor(scope: core.Construct, id: string, canonicalName: string, healthRoute: string);
    allowIngressTo(connections: Connections): void;
    deployTo(platform: Platform, subdomain: string | SiteRoot): IDeployment;
}
