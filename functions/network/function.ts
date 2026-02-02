import {
  fatal,
  type FunctionHandler,
  getDesiredComposedResources,
  getDesiredCompositeResource,
  getObservedComposedResources,
  getObservedCompositeResource,
  type Logger,
  normal,
  Resource,
  RunFunctionRequest,
  RunFunctionResponse,
  setDesiredComposedResources,
  setDesiredCompositeStatus,
  to,
} from '@crossplane-org/function-sdk-typescript';
import {
  InternetGateway,
  MainRouteTableAssociation,
  Route,
  RouteTable,
  RouteTableAssociation,
  SecurityGroup,
  SecurityGroupRule,
  Subnet,
  VPC,
} from './model/ec2.aws.m.upbound.io/v1beta1/index.js';

/**
 * Function creates AWS network infrastructure including VPC, subnets,
 * route tables, internet gateway, and security groups
 */
export class Function implements FunctionHandler {
  // eslint-disable-next-line @typescript-eslint/require-await
  async RunFunction(req: RunFunctionRequest, logger?: Logger): Promise<RunFunctionResponse> {
    const startTime = Date.now();

    // Set up a minimal response from the request
    let rsp = to(req);

    try {
      // Get our Observed Composite
      const observedComposite = getObservedCompositeResource(req);
      logger?.debug({ oxr: observedComposite }, 'Observed composite resource');

      // Get our Desired Composite
      const desiredComposite = getDesiredCompositeResource(req);
      logger?.debug({ dxr: desiredComposite }, 'Desired composite resource');

      // Desired and ObservedComposed resources
      const desiredComposed = getDesiredComposedResources(req);
      const observedComposed = getObservedComposedResources(req);

      const namespace = observedComposite?.resource?.metadata?.namespace;
      const region = observedComposite?.resource?.spec?.parameters?.region;
      const id = observedComposite?.resource?.spec?.parameters?.id;
      const subnets = observedComposite?.resource?.spec?.parameters?.subnets || [];

      // Collect resource status
      const securityGroupIds: string[] = [];
      const privateSubnetIds: string[] = [];
      const publicSubnetIds: string[] = [];
      const subnetIds: string[] = [];

      // Common metadata for all resources
      const commonMetadata = {
        ...(namespace && { namespace: namespace }),
        labels: {
          'networks.aws.platform.upbound.io/network-id':
            observedComposite?.resource?.spec?.parameters.id,
        },
      };

      // common spec fields
      const commonSpec = {
        managementPolicies: observedComposite?.resource?.spec?.parameters?.managementPolicies || [
          '*',
        ],
        providerConfigRef: {
          kind: 'ProviderConfig',
          name: observedComposite?.resource?.spec?.parameters?.providerConfigName || 'default',
        },
      };

      const vpc = new VPC({
        metadata: {
          ...commonMetadata,
        },
        spec: {
          ...commonSpec,
          forProvider: {
            cidrBlock: observedComposite?.resource?.spec?.parameters?.vpcCidrBlock,
            enableDnsHostnames: true,
            enableDnsSupport: true,
            region: region,
            tags: {
              Name: observedComposite?.resource?.metadata?.name,
            },
          },
        },
      });

      vpc.validate();

      desiredComposed['vpc'] = Resource.fromJSON({
        resource: vpc.toJSON(),
      });

      const igw = new InternetGateway({
        metadata: {
          ...commonMetadata,
        },
        spec: {
          ...commonSpec,
          forProvider: {
            region: region,
            vpcIdSelector: {
              matchControllerRef: true,
            },
          },
        },
      });

      igw.validate();
      desiredComposed['igw'] = Resource.fromJSON({
        resource: igw.toJSON(),
      });

      // create Subnets and RouteTableAssociations for each subnet
      for (const subnet of subnets) {
        const name = formatSubnetName({
          availabilityZone: subnet.availabilityZone,
          cidr: subnet.cidrBlock,
          type: subnet.type,
        });
        const s = new Subnet({
          metadata: {
            ...commonMetadata,
            labels: {
              access: subnet?.type || 'private',
              zone: subnet?.availabilityZone,
              'networks.aws.platform.upbound.io/network-id': id,
            },
          },
          spec: {
            ...commonSpec,
            forProvider: {
              availabilityZone: subnet?.availabilityZone,
              cidrBlock: subnet?.cidrBlock,
              mapPublicIpOnLaunch: subnet?.type === 'public',
              region: region,
              tags: {
                ...(subnet?.type === 'private'
                  ? { 'kubernetes.io/role/internal-elb': '1' }
                  : {
                      'kubernetes.io/role/elb': '1',
                      'networks.aws.platform.upbound.io/network-id':
                        observedComposite?.resource?.spec?.parameters.id,
                    }),
              },
              vpcIdSelector: {
                matchControllerRef: true,
              },
            },
          },
        });
        s.validate();
        const subnetKey = 'subnet-' + name;
        desiredComposed[subnetKey] = Resource.fromJSON({
          resource: s.toJSON(),
        });

        const subnetId = observedComposed?.[subnetKey]?.resource?.status?.atProvider?.id;
        if (subnetId) {
          subnetIds.push(subnetId);
          if (subnet.type === 'public') {
            publicSubnetIds.push(subnetId);
          } else if (subnet.type === 'private') {
            privateSubnetIds.push(subnetId);
          }
        }
        const rta = new RouteTableAssociation({
          metadata: {
            ...commonMetadata,
          },
          spec: {
            ...commonSpec,
            forProvider: {
              region: region,
              routeTableIdSelector: {
                matchControllerRef: true,
              },
              subnetIdSelector: {
                matchControllerRef: true,
                matchLabels: {
                  access: subnet?.type === 'private' ? 'private' : 'public',
                  zone: subnet?.availabilityZone,
                },
              },
            },
          },
        });
        rta.validate();
        desiredComposed['rta-' + name] = Resource.fromJSON({
          resource: rta.toJSON(),
        });
      }

      const rt = new RouteTable({
        metadata: {
          ...commonMetadata,
        },
        spec: {
          ...commonSpec,
          forProvider: {
            region: region,
            vpcIdSelector: {
              matchControllerRef: true,
            },
          },
        },
      });

      rt.validate();
      desiredComposed['rt'] = Resource.fromJSON({
        resource: rt.toJSON(),
      });

      const mrta = new MainRouteTableAssociation({
        metadata: {
          ...commonMetadata,
        },
        spec: {
          ...commonSpec,
          forProvider: {
            region: region,
            routeTableIdSelector: {
              matchControllerRef: true,
            },
            vpcIdSelector: {
              matchControllerRef: true,
            },
          },
        },
      });

      mrta.validate();
      desiredComposed['mrta'] = Resource.fromJSON({
        resource: mrta.toJSON(),
      });

      const route = new Route({
        metadata: {
          ...commonMetadata,
        },
        spec: {
          ...commonSpec,
          forProvider: {
            destinationCidrBlock: '0.0.0.0/0',
            region: region,
            gatewayIdSelector: {
              matchControllerRef: true,
            },
            routeTableIdSelector: {
              matchControllerRef: true,
            },
          },
        },
      });

      route.validate();
      desiredComposed['route'] = Resource.fromJSON({
        resource: route.toJSON(),
      });

      // These should probably be moved to configuration-aws-database
      const sg = new SecurityGroup({
        metadata: {
          ...commonMetadata,
        },
        spec: {
          ...commonSpec,
          forProvider: {
            name: 'platform-ref-aws-cluster',
            description: 'Allow access to databases',
            region: region,
            vpcIdSelector: {
              matchControllerRef: true,
            },
          },
        },
      });

      sg.validate();
      desiredComposed['sg'] = Resource.fromJSON({
        resource: sg.toJSON(),
      });

      const sgrPostgres = new SecurityGroupRule({
        metadata: {
          ...commonMetadata,
        },
        spec: {
          ...commonSpec,
          forProvider: {
            cidrBlocks: ['0.0.0.0/0'],
            fromPort: 5432,
            description: 'Everywhere',
            securityGroupIdSelector: {
              matchControllerRef: true,
            },
            protocol: 'tcp',
            region: region,
            toPort: 5432,
            type: 'ingress',
          },
        },
      });
      sgrPostgres.validate();
      desiredComposed['sgr-postgres'] = Resource.fromJSON({
        resource: sgrPostgres.toJSON(),
      });

      const sgrMysql = new SecurityGroupRule({
        metadata: {
          ...commonMetadata,
        },
        spec: {
          ...commonSpec,
          forProvider: {
            cidrBlocks: ['0.0.0.0/0'],
            fromPort: 3306,
            description: 'Everywhere',
            securityGroupIdSelector: {
              matchControllerRef: true,
            },
            protocol: 'tcp',
            region: region,
            toPort: 3306,
            type: 'ingress',
          },
        },
      });
      sgrMysql.validate();
      desiredComposed['sgr-mysql'] = Resource.fromJSON({
        resource: sgrMysql.toJSON(),
      });

      // set the desired composed resources
      rsp = setDesiredComposedResources(rsp, desiredComposed);

      const vpcId = observedComposed?.vpc?.resource?.status?.atProvider?.id;
      if (observedComposed?.sg?.resource?.status?.atProvider?.id) {
        securityGroupIds.push(observedComposed.sg.resource.status.atProvider.id);
      }
      // update the composite status
      const xrStatus: XRStatus = {
        ...(privateSubnetIds.length > 0 && { privateSubnetIds }),
        ...(publicSubnetIds.length > 0 && { publicSubnetIds }),
        ...(securityGroupIds.length > 0 && { securityGroupIds }),
        ...(subnetIds.length > 0 && { subnetIds }),
        ...(vpcId && { vpcId }),
      };

      rsp = setDesiredCompositeStatus({ rsp, status: xrStatus });

      const duration = Date.now() - startTime;
      logger?.info({ duration: `${duration}ms` }, 'Function completed successfully');

      normal(rsp, 'processing complete');
      return rsp;
    } catch (error) {
      const duration = Date.now() - startTime;
      logger?.error(
        {
          error: error instanceof Error ? error.message : String(error),
          duration: `${duration}ms`,
        },
        'Function invocation failed'
      );

      fatal(rsp, error instanceof Error ? error.message : String(error));
      return rsp;
    }
  }
}

// Status fields for an XR
// Values can be either a single string (e.g., vpcId) or an array of strings (e.g., subnetIds)
interface XRStatus {
  [key: string]: string | string[];
}

// converts a CIDR into a string usable in a composed resource name
// 1.2.3.4/32 -> 1-2-3-4-32
export function formatCIDR(cidr: string): string {
  return cidr.replace(/[./]/g, '-');
}

interface SubnetSettings {
  availabilityZone: string;
  cidr: string;
  type: string;
}

// formatSubnetName generates a name based on Availability Zone, CIDR, and type like us-west-2b-192-168-64-0-18-public
export function formatSubnetName(subnet: SubnetSettings): string {
  return `${subnet?.availabilityZone}-${formatCIDR(subnet.cidr)}-${subnet?.type}`;
}
