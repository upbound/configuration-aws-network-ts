# Test Cases

This directory contains test cases for the Crossplane AWS Network function. Test cases can be written in either YAML or JSON format and are automatically loaded by the test suite.

## Running Tests

Run all tests including test case files:

```bash
npm test
```

Run tests in watch mode during development:

```bash
npm test -- --watch
```

## Test Case Format

Each test case file should define one or more test cases with the following structure:

### YAML Format

```yaml
---
name: Test Case Name
description: Optional description of what this test validates

input:
  observed:
    composite:
      resource:
        apiVersion: aws.platform.upbound.io/v1alpha1
        kind: Network
        metadata:
          name: test-network
          namespace: network-team
        spec:
          parameters:
            id: test-network
            region: us-west-2
            vpcCidrBlock: 192.168.0.0/16
            subnets:
              - availabilityZone: us-west-2a
                type: public
                cidrBlock: 192.168.0.0/18

    # Optional: Include observed resources with status
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
  # Expected number of resources to be created
  resourceCount: 16

  # Expected resource types (partial list)
  resourceTypes:
    - VPC
    - InternetGateway
    - Subnet

  # Specific resource assertions (partial match) - map format
  resources:
    vpc:
      kind: VPC
      apiVersion: ec2.aws.m.upbound.io/v1beta1
      spec:
        forProvider:
          cidrBlock: 192.168.0.0/16
          region: us-west-2

  # Expected status fields on the composite resource
  status:
    vpcId: any-value
```

### JSON Format

```json
{
  "name": "Test Case Name",
  "description": "Optional description",
  "input": {
    "observed": {
      "composite": {
        "resource": {
          "apiVersion": "aws.platform.upbound.io/v1alpha1",
          "kind": "Network",
          "metadata": {
            "name": "test-network"
          },
          "spec": {
            "parameters": {
              "region": "us-west-2",
              "vpcCidrBlock": "10.0.0.0/16",
              "subnets": []
            }
          }
        }
      }
    }
  },
  "expected": {
    "resourceCount": 10,
    "resourceTypes": ["VPC", "InternetGateway"]
  }
}
```

## Expected Assertions

The test framework supports several types of assertions:

### Resource Count

```yaml
expected:
  resourceCount: 16
```

Validates that exactly 16 resources are created.

### Resource Types

```yaml
expected:
  resourceTypes:
    - VPC
    - Subnet
    - InternetGateway
```

Validates that these resource kinds are present in the output (doesn't need to be exhaustive).

### Specific Resources

Resources are specified as a **map** where keys are resource names:

```yaml
expected:
  resources:
    vpc:
      kind: VPC
      apiVersion: ec2.aws.m.upbound.io/v1beta1
      metadata:
        namespace: network-team
        labels:
          networks.aws.platform.upbound.io/network-id: test-network
      spec:
        forProvider:
          cidrBlock: 192.168.0.0/16
          enableDnsHostnames: true
          region: us-west-2

    igw:
      kind: InternetGateway
      apiVersion: ec2.aws.m.upbound.io/v1beta1
      spec:
        forProvider:
          region: us-west-2
```

This format:

- **Mirrors the input structure** (consistent with `input.observed.resources`)
- Makes it easy to reference specific resources by name
- Validates with **partial match** - only the fields you specify are checked

Benefits:

- Check specific fields without listing every field
- Validate nested properties
- Focus assertions on what's important for each test case

### Composite Status

```yaml
expected:
  status:
    vpcId: vpc-12345
    privateSubnetIds:
      - subnet-abc
      - subnet-def
```

Validates the status fields set on the composite resource (partial match).

## Testing with Observed Resources

Observed resources simulate what Crossplane passes to your function when resources already exist in the cluster with status information from the provider. This is useful for testing:

- **Status Propagation**: Verify that resource IDs from AWS are correctly propagated to the composite status
- **Reconciliation**: Test how your function behaves when resources already exist
- **Update Scenarios**: Simulate updating existing infrastructure

### Example with Observed Resources

```yaml
input:
  observed:
    composite:
      resource:
        # Your composite resource spec

    resources:
      vpc:
        resource:
          apiVersion: ec2.aws.m.upbound.io/v1beta1
          kind: VPC
          metadata:
            annotations:
              crossplane.io/composition-resource-name: vpc
            name: my-network-vpc-abc123
          spec:
            forProvider:
              cidrBlock: 192.168.0.0/16
          status:
            atProvider:
              id: vpc-0a1b2c3d4e5f6g7h8  # Simulates AWS provider status

expected:
  # Verify status is propagated to composite
  status:
    vpcId: vpc-0a1b2c3d4e5f6g7h8
```

This simulates the scenario where:

1. Crossplane has already created the VPC resource
2. The AWS provider has reconciled it and set the `status.atProvider.id`
3. Your function receives this observed state and should propagate it to the composite status

## Examples

See the existing test case files in this directory:

- [basic-network.yaml](./basic-network.yaml) - Full multi-AZ network configuration
- [single-az-network.json](./single-az-network.json) - Simple single-AZ network
- [example-from-render.yaml](./example-from-render.yaml) - Matches `npm run local-render` output
- [network-with-status.yaml](./network-with-status.yaml) - Tests status propagation with observed resources

## Writing Your Own Test Cases

1. Create a new `.yaml` or `.json` file in this directory
2. Define your test case(s) following the format above
3. Run `npm test` - the test suite will automatically discover and run your test cases

### Tips

- Start with the output of `npm run local-render` to understand what resources are created
- Use partial matching to focus on the most important assertions
- Group related test cases in the same file (multiple YAML documents or JSON array)
- Use descriptive names and descriptions to document what each test validates

## Comparing with Rendered Output

To see what your function produces for a given input:

```bash
npm run local-render
```

This runs the Crossplane render command with the example inputs and shows all generated resources. You can use this output to:

1. Understand what resources are created
2. Identify which resources and fields to assert in your tests
3. Debug test failures by comparing expected vs actual output

## Test Helper API

The test framework provides several helper functions in [test-helpers.ts](../test-helpers.ts):

- `loadTestCases(filePath)` - Load test cases from YAML or JSON
- `assertTestCase(response, testCase)` - Run all assertions for a test case
- `assertResources(response, expectedResources)` - Assert specific resources
- `assertStatus(response, expectedStatus)` - Assert composite status
- `assertResourceCount(response, count)` - Assert resource count
- `assertResourceTypes(response, types)` - Assert resource types exist

You can use these directly in custom tests in [function.test.ts](../function.test.ts).
