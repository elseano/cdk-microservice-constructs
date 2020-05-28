import * as cdk from '@aws-cdk/core';
import * as route53 from '@aws-cdk/aws-route53';
import { Platform, IDeployment, IRoutable } from './platform';
import { IConnectable, InterfaceVpcEndpoint, IVpc } from '@aws-cdk/aws-ec2';
import { Ec2Service } from '@aws-cdk/aws-ecs';
import { RecordTarget, IHostedZone } from '@aws-cdk/aws-route53';
import {RegionInfo} from '@aws-cdk/region-info';
import { CfnOutput } from '@aws-cdk/core';

class InterfaceVpcEndpointTarget implements route53.IAliasRecordTarget {
  constructor(private readonly interfaceVpcEndpoint: InterfaceVpcEndpoint) {
  }

  bind(_record: route53.IRecordSet): route53.AliasRecordTargetConfig {
    const regionalDnsParts = cdk.Fn.split(":", cdk.Fn.select(0, this.interfaceVpcEndpoint.vpcEndpointDnsEntries))

    const dnsName = cdk.Lazy.stringValue({
      produce() {
        return cdk.Fn.select(1, regionalDnsParts)
      }
    })

    const hostedZoneId = cdk.Lazy.stringValue({
      produce() {
        return cdk.Fn.select(0, regionalDnsParts)
      }
    })

    return {
      dnsName,
      hostedZoneId
    }
  }
}

export class ExternalService extends cdk.Construct {
  connectable: IConnectable
  interfaceEndpoint: InterfaceVpcEndpoint;

  constructor(scope: cdk.Construct, private readonly id: string, private readonly vpc: IVpc, name: string) {
    super(scope, id)

    this.interfaceEndpoint = new InterfaceVpcEndpoint(scope, id + "Endpoint", { service: { name, port: 80 }, vpc, privateDnsEnabled: false })

    this.connectable = this.interfaceEndpoint
  }

  deployTo(platform: Platform, subdomain: string) : IRoutable {
    const r53 = new route53.ARecord(this, "Domain", {
      recordName: `${subdomain}`,
      zone: platform.zone,
      // target: RecordTarget.fromAlias(target)
      target: RecordTarget.fromAlias(new InterfaceVpcEndpointTarget(this.interfaceEndpoint))
    })

    new CfnOutput(this, "Route", { exportName: "Route", value: r53.domainName })

    return {
      route: `${subdomain}.${platform.zone.zoneName}`,
    }
  }
}