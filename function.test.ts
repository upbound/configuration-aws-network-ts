import { describe, it, expect } from '@jest/globals';
import { formatCIDR, formatSubnetName, Function } from './function.js';
import {
  loadTestCases,
  assertTestCase,
  buildObservedResource,
  buildTestInput,
} from './test-helpers.js';
import { readdirSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

describe('formatCIDR', () => {
  it('should convert a standard CIDR block with slash notation', () => {
    expect(formatCIDR('192.168.0.1/24')).toBe('192-168-0-1-24');
  });

  it('should convert CIDR block 10.0.0.0/16', () => {
    expect(formatCIDR('10.0.0.0/16')).toBe('10-0-0-0-16');
  });

  it('should convert CIDR block 172.16.0.0/12', () => {
    expect(formatCIDR('172.16.0.0/12')).toBe('172-16-0-0-12');
  });

  it('should handle CIDR with /32 subnet mask', () => {
    expect(formatCIDR('192.168.1.1/32')).toBe('192-168-1-1-32');
  });

  it('should handle CIDR with /8 subnet mask', () => {
    expect(formatCIDR('10.0.0.0/8')).toBe('10-0-0-0-8');
  });

  it('should handle larger octet values', () => {
    expect(formatCIDR('255.255.255.255/32')).toBe('255-255-255-255-32');
  });

  it('should handle IPv6-like input if provided', () => {
    expect(formatCIDR('2001:db8::1/64')).toBe('2001:db8::1-64');
  });

  it('should handle edge case with multiple consecutive dots', () => {
    expect(formatCIDR('192..168.0.1/24')).toBe('192--168-0-1-24');
  });
});

describe('formatSubnetName', () => {
  it('should format subnet name correctly', () => {
    const result = formatSubnetName({
      availabilityZone: 'us-west-2a',
      cidr: '192.168.0.0/18',
      type: 'public',
    });
    expect(result).toBe('us-west-2a-192-168-0-0-18-public');
  });

  it('should format private subnet name correctly', () => {
    const result = formatSubnetName({
      availabilityZone: 'us-east-1b',
      cidr: '10.0.1.0/24',
      type: 'private',
    });
    expect(result).toBe('us-east-1b-10-0-1-0-24-private');
  });
});

describe('Function integration tests', () => {
  const func = new Function();

  it('should create VPC with correct CIDR block', async () => {
    const request = {
      observed: {
        composite: {
          resource: {
            apiVersion: 'aws.platform.upbound.io/v1alpha1',
            kind: 'Network',
            metadata: {
              name: 'test-network',
              namespace: 'test',
            },
            spec: {
              parameters: {
                id: 'test-network',
                region: 'us-west-2',
                vpcCidrBlock: '10.0.0.0/16',
                subnets: [],
              },
            },
          },
        },
      },
    };

    const response = await func.RunFunction(request as any);

    expect(response.desired?.resources).toBeDefined();
    const vpc = response.desired!.resources['vpc'];
    expect(vpc).toBeDefined();

    const vpcResource = vpc.resource as any;
    expect(vpcResource.kind).toBe('VPC');
    expect(vpcResource.spec.forProvider.cidrBlock).toBe('10.0.0.0/16');
    expect(vpcResource.spec.forProvider.region).toBe('us-west-2');
  });

  it('should create subnets with correct configuration', async () => {
    const request = {
      observed: {
        composite: {
          resource: {
            apiVersion: 'aws.platform.upbound.io/v1alpha1',
            kind: 'Network',
            metadata: {
              name: 'test-network',
              namespace: 'test',
            },
            spec: {
              parameters: {
                id: 'test-network',
                region: 'us-west-2',
                vpcCidrBlock: '10.0.0.0/16',
                subnets: [
                  {
                    availabilityZone: 'us-west-2a',
                    type: 'public',
                    cidrBlock: '10.0.0.0/24',
                  },
                  {
                    availabilityZone: 'us-west-2a',
                    type: 'private',
                    cidrBlock: '10.0.1.0/24',
                  },
                ],
              },
            },
          },
        },
      },
    };

    const response = await func.RunFunction(request as any);

    const resources = response.desired!.resources;

    // Check public subnet
    const publicSubnet = resources['subnet-us-west-2a-10-0-0-0-24-public'];
    expect(publicSubnet).toBeDefined();
    const publicSubnetResource = publicSubnet.resource as any;
    expect(publicSubnetResource.spec.forProvider.mapPublicIpOnLaunch).toBe(true);
    expect(publicSubnetResource.metadata.labels.access).toBe('public');

    // Check private subnet
    const privateSubnet = resources['subnet-us-west-2a-10-0-1-0-24-private'];
    expect(privateSubnet).toBeDefined();
    const privateSubnetResource = privateSubnet.resource as any;
    expect(privateSubnetResource.spec.forProvider.mapPublicIpOnLaunch).toBe(false);
    expect(privateSubnetResource.metadata.labels.access).toBe('private');
  });

  it('should create security groups and rules', async () => {
    const request = {
      observed: {
        composite: {
          resource: {
            apiVersion: 'aws.platform.upbound.io/v1alpha1',
            kind: 'Network',
            metadata: {
              name: 'test-network',
              namespace: 'test',
            },
            spec: {
              parameters: {
                id: 'test-network',
                region: 'us-west-2',
                vpcCidrBlock: '10.0.0.0/16',
                subnets: [],
              },
            },
          },
        },
      },
    };

    const response = await func.RunFunction(request as any);

    const resources = response.desired!.resources;

    // Check security group
    const sg = resources['sg'];
    expect(sg).toBeDefined();

    // Check postgres rule
    const sgrPostgres = resources['sgr-postgres'];
    expect(sgrPostgres).toBeDefined();
    const postgresRule = sgrPostgres.resource as any;
    expect(postgresRule.spec.forProvider.fromPort).toBe(5432);
    expect(postgresRule.spec.forProvider.toPort).toBe(5432);

    // Check mysql rule
    const sgrMysql = resources['sgr-mysql'];
    expect(sgrMysql).toBeDefined();
    const mysqlRule = sgrMysql.resource as any;
    expect(mysqlRule.spec.forProvider.fromPort).toBe(3306);
    expect(mysqlRule.spec.forProvider.toPort).toBe(3306);
  });

  it('should propagate status from observed resources to composite', async () => {
    const func = new Function();

    // Build test input with observed resources that have status
    const input = buildTestInput({
      composite: {
        apiVersion: 'aws.platform.upbound.io/v1alpha1',
        kind: 'Network',
        metadata: {
          name: 'status-test',
          namespace: 'test',
        },
        spec: {
          parameters: {
            id: 'status-test',
            region: 'us-west-2',
            vpcCidrBlock: '10.0.0.0/16',
            subnets: [
              {
                availabilityZone: 'us-west-2a',
                type: 'public',
                cidrBlock: '10.0.0.0/24',
              },
            ],
          },
        },
      },
      observedResources: {
        vpc: buildObservedResource({
          name: 'vpc',
          kind: 'VPC',
          apiVersion: 'ec2.aws.m.upbound.io/v1beta1',
          status: {
            atProvider: {
              id: 'vpc-test123',
            },
          },
        }),
        sg: buildObservedResource({
          name: 'sg',
          kind: 'SecurityGroup',
          apiVersion: 'ec2.aws.m.upbound.io/v1beta1',
          status: {
            atProvider: {
              id: 'sg-test456',
            },
          },
        }),
        'subnet-us-west-2a-10-0-0-0-24-public': buildObservedResource({
          name: 'subnet-us-west-2a-10-0-0-0-24-public',
          kind: 'Subnet',
          apiVersion: 'ec2.aws.m.upbound.io/v1beta1',
          metadata: {
            labels: {
              access: 'public',
              zone: 'us-west-2a',
            },
          },
          status: {
            atProvider: {
              id: 'subnet-test789',
            },
          },
        }),
      },
    });

    const response = await func.RunFunction(input);

    // Check that status is propagated to composite
    const compositeStatus = response.desired?.composite?.resource?.status;
    expect(compositeStatus).toBeDefined();
    expect(compositeStatus.vpcId).toBe('vpc-test123');
    expect(compositeStatus.securityGroupIds).toContain('sg-test456');
    expect(compositeStatus.subnetIds).toContain('subnet-test789');
    expect(compositeStatus.publicSubnetIds).toContain('subnet-test789');
  });
});

describe('Test cases from files', () => {
  const testCasesDir = join(__dirname, 'test-cases');

  // Skip if test-cases directory doesn't exist
  let testFiles: string[] = [];
  try {
    testFiles = readdirSync(testCasesDir).filter(
      (f) => f.endsWith('.yaml') || f.endsWith('.yml') || f.endsWith('.json')
    );
  } catch (_e) {
    // Directory doesn't exist, skip these tests
  }

  if (testFiles.length === 0) {
    it.skip('no test case files found', () => {});
  } else {
    const func = new Function();

    testFiles.forEach((file) => {
      describe(`Test cases from ${file}`, () => {
        const testCases = loadTestCases(join(testCasesDir, file));

        testCases.forEach((testCase) => {
          it(testCase.name, async () => {
            const response = await func.RunFunction(testCase.input as any);

            // Run all assertions
            expect(() => assertTestCase(response, testCase)).not.toThrow();
          });
        });
      });
    });
  }
});
