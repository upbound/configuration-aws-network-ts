# Testing Guide

This project includes a testing framework for validating the Crossplane AWS Network function output.

## Quick Start

Run all tests:

```bash
npm test
```

## Test Structure

The testing framework consists of three main components:

1. **Test Helper Module** ([test-helpers.ts](./test-helpers.ts))
   - Utilities for loading test cases from YAML/JSON files
   - Assertion helpers for validating function output
   - Support for partial matching of complex objects

2. **Test Suite** ([function.test.ts](./function.test.ts))
   - Unit tests for utility functions (`formatCIDR`, `formatSubnetName`)
   - Integration tests for the function's core behavior
   - Automatic discovery and execution of file-based test cases

3. **Test Cases Directory** ([test-cases/](./test-cases/))
   - YAML and JSON test case definitions
   - Each test case specifies inputs and expected outputs
   - Automatically loaded and executed by the test suite

## Creating Test Cases

### Option 1: File-Based Test Cases (Recommended)

Create a new YAML or JSON file in the `test-cases/` directory:

**YAML Example** (`test-cases/my-test.yaml`):

```yaml
---
name: My Test Case
description: What this test validates

input:
  observed:
    composite:
      resource:
        apiVersion: aws.platform.upbound.io/v1alpha1
        kind: Network
        metadata:
          name: my-network
          namespace: test
        spec:
          parameters:
            id: my-network
            region: us-west-2
            vpcCidrBlock: 10.0.0.0/16
            subnets:
              - availabilityZone: us-west-2a
                type: public
                cidrBlock: 10.0.0.0/24

expected:
  resourceCount: 12
  resourceTypes:
    - VPC
    - Subnet
  resources:
    vpc:
      kind: VPC
      spec:
        forProvider:
          cidrBlock: 10.0.0.0/16
```

**JSON Example** (`test-cases/my-test.json`):

```json
{
  "name": "My Test Case",
  "input": {
    "observed": {
      "composite": {
        "resource": { "..." }
      }
    }
  },
  "expected": {
    "resourceCount": 12
  }
}
```

The test suite automatically discovers and runs all `.yaml`, `.yml`, and `.json` files in the `test-cases/` directory.

### Option 2: Direct Integration Tests

Add tests directly to [function.test.ts](./function.test.ts):

```typescript
it('should do something specific', async () => {
    const func = new Function();
    const request = { /* ... */ };
    const response = await func.RunFunction(request);

    expect(response.desired?.resources).toBeDefined();
    // Your assertions here
});
```

## Assertion Types

The test framework supports several types of assertions:

### 1. Resource Count

Validate the exact number of resources created:

```yaml
expected:
  resourceCount: 16
```

### 2. Resource Types

Check that specific Kubernetes resource kinds exist:

```yaml
expected:
  resourceTypes:
    - VPC
    - Subnet
    - SecurityGroup
```

### 3. Specific Resources (Partial Match)

Validate individual resources using a map format (consistent with input structure) - only specified fields are checked:

```yaml
expected:
  resources:
    vpc:
      kind: VPC
      apiVersion: ec2.aws.m.upbound.io/v1beta1
      metadata:
        namespace: network-team
        labels:
          custom-label: value
      spec:
        forProvider:
          cidrBlock: 192.168.0.0/16
          region: us-west-2

    igw:
      kind: InternetGateway
      apiVersion: ec2.aws.m.upbound.io/v1beta1
      spec:
        forProvider:
          region: us-west-2
```

The map format and partial matching allow you to:

- Use the same structure as `input.observed.resources` (consistent!)
- Reference resources by name without nested arrays
- Focus on important fields without listing everything
- Check nested properties
- Validate arrays and complex objects
- Ignore fields you don't care about

### 4. Composite Status

Validate status fields set on the composite resource:

```yaml
expected:
  status:
    vpcId: vpc-12345
    privateSubnetIds:
      - subnet-abc
    securityGroupIds:
      - sg-xyz
```

## Workflow

### 1. Generate Reference Output

Use `npm run local-render` to see what your function produces:

```bash
npm run local-render
```

This shows all resources that would be created for the example configuration.

### 2. Create Test Case

Based on the output:
1. Identify which resources and fields are important to test
2. Create a test case file in `test-cases/`
3. Use partial matching to focus on critical assertions

### 3. Run Tests

```bash
npm test
```

### 4. Iterate

If tests fail:
- Check the error message to see what doesn't match
- Use `npm run local-render` to compare expected vs actual
- Update your test case or fix the function code

## Example Test Cases

The project includes four example test cases:

1. **[basic-network.yaml](./test-cases/basic-network.yaml)**
   - Multi-AZ network with public and private subnets
   - Demonstrates comprehensive resource validation

2. **[single-az-network.json](./test-cases/single-az-network.json)**
   - Simple single-AZ configuration
   - JSON format example

3. **[example-from-render.yaml](./test-cases/example-from-render.yaml)**
   - Matches the exact output from `npm run local-render`
   - Complete validation of all 16 resources

4. **[network-with-status.yaml](./test-cases/network-with-status.yaml)**
   - Tests status propagation from observed resources
   - Simulates resources that already exist with AWS IDs

## Testing with Observed Resources

Your function can be tested with observed resources that have status information, simulating the state after AWS resources have been created. This is essential for testing:

- **Status Propagation**: Verify that AWS resource IDs are correctly propagated to the composite status
- **Reconciliation**: Test how your function behaves when resources already exist
- **Update Scenarios**: Simulate changes to existing infrastructure

### Using Helper Functions

```typescript
import {
    buildObservedResource,
    buildTestInput
} from './test-helpers.js';

const func = new Function();

const input = buildTestInput({
    composite: {
        apiVersion: 'aws.platform.upbound.io/v1alpha1',
        kind: 'Network',
        metadata: { name: 'my-network' },
        spec: {
            parameters: {
                region: 'us-west-2',
                vpcCidrBlock: '10.0.0.0/16',
                subnets: [...]
            }
        }
    },
    observedResources: {
        vpc: buildObservedResource({
            name: 'vpc',
            kind: 'VPC',
            apiVersion: 'ec2.aws.m.upbound.io/v1beta1',
            status: {
                atProvider: {
                    id: 'vpc-12345'  // Simulates AWS provider status
                }
            }
        }),
        sg: buildObservedResource({
            name: 'sg',
            kind: 'SecurityGroup',
            apiVersion: 'ec2.aws.m.upbound.io/v1beta1',
            status: {
                atProvider: {
                    id: 'sg-67890'
                }
            }
        })
    }
});

const response = await func.RunFunction(input);

// Verify status propagation
expect(response.desired?.composite?.resource?.status.vpcId).toBe('vpc-12345');
```

### In YAML Test Cases

```yaml
input:
  observed:
    composite:
      resource:
        # Your composite spec

    resources:
      vpc:
        resource:
          apiVersion: ec2.aws.m.upbound.io/v1beta1
          kind: VPC
          metadata:
            annotations:
              crossplane.io/composition-resource-name: vpc
          status:
            atProvider:
              id: vpc-12345

expected:
  status:
    vpcId: vpc-12345
```

See [network-with-status.yaml](./test-cases/network-with-status.yaml) for a complete example.

## Best Practices

1. **Use Partial Matching**: Only assert on fields that matter for your test case
2. **Name Tests Clearly**: Use descriptive names that explain what's being validated
3. **Group Related Tests**: Put related test cases in the same file
4. **Start Simple**: Begin with basic assertions (count, types) before detailed checks
5. **Test Edge Cases**: Create test cases for unusual configurations
6. **Keep Tests Fast**: File-based tests are fast and easy to maintain

## Test Helper API

For advanced testing, use the helpers from [test-helpers.ts](./test-helpers.ts):

```typescript
import {
    loadTestCases,
    assertTestCase,
    assertResources,
    assertResourceCount,
    assertResourceTypes,
    assertStatus,
    buildObservedResource,
    buildTestInput
} from './test-helpers.js';

// Load test cases
const testCases = loadTestCases('test-cases/my-test.yaml');

// Run assertions
const response = await func.RunFunction(request);
assertTestCase(response, testCases[0]);

// Or use individual assertions
assertResourceCount(response, 16);
assertResourceTypes(response, ['VPC', 'Subnet']);

// Build test inputs with observed resources
const input = buildTestInput({
    composite: { /* ... */ },
    observedResources: {
        vpc: buildObservedResource({ /* ... */ })
    }
});
```

## Continuous Integration

Add this to your CI pipeline:

```bash
npm test
```

Tests run quickly and don't require any external dependencies or credentials.

## Troubleshooting

### Test Fails: "Expected resource 'X' not found"

The resource name might not match. Check:

- The `crossplane.io/composition-resource-name` annotation
- The resource key in the function output

### Test Fails: "Expected N resources, got M"

Your function is creating more/fewer resources than expected. Run:

```bash
npm run local-render
```

Count the resources in the output and update `resourceCount`.

### Test Fails: "Resource 'X' has wrong Y"

The assertion found the resource but a field doesn't match:

- Check the error message for expected vs actual values
- Verify your test case has the correct expected value
- Check if the function is generating the value correctly

### Import Errors

Make sure you've installed dependencies:

```bash
npm install
```

The `yaml` package is required for YAML test case support.

## Further Reading

- [Test Cases README](./test-cases/README.md) - Detailed guide to test case format
- [function.test.ts](./function.test.ts) - Example integration tests
- [test-helpers.ts](./test-helpers.ts) - Implementation details of test helpers
