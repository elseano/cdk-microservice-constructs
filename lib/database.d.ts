import * as core from '@aws-cdk/core';
import { InstanceType } from '@aws-cdk/aws-ec2';
import { Platform, IOutboundConnection } from './platform';
export interface DatabaseProps {
    name: string;
    instanceClass: InstanceType;
    username?: string;
}
export declare class Database extends core.Construct {
    private readonly database;
    private readonly databaseName;
    constructor(scope: core.Construct, id: string, platform: Platform, props: DatabaseProps);
    grantAccess(target: IOutboundConnection, name: string): void;
}
