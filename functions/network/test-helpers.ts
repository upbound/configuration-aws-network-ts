import { readFileSync } from 'fs';
import { parseAllDocuments } from 'yaml';
import { RunFunctionRequest, RunFunctionResponse } from '@crossplane-org/function-sdk-typescript';

/**
 * Represents a Kubernetes resource object structure.
 * This is used for dynamic resources where the exact shape isn't known at compile time.
 */
export type KubernetesResource = Record<string, unknown>;

/**
 * Kubernetes metadata for a resource
 */
export interface KubernetesMetadata {
  name?: string;
  namespace?: string;
  labels?: Record<string, string>;
  annotations?: Record<string, string>;
  [key: string]: unknown;
}

/**
 * Expected metadata for test assertions (subset of KubernetesMetadata)
 */
export interface ExpectedMetadata {
  labels?: Record<string, string>;
  annotations?: Record<string, string>;
  namespace?: string;
}

/**
 * Resource status from a provider (e.g., AWS, Azure, GCP)
 */
export interface ResourceStatus {
  atProvider?: KubernetesResource;
  conditions?: Array<Record<string, unknown>>;
  [key: string]: unknown;
}

export interface TestCase {
  name: string;
  description?: string;
  input: RunFunctionRequest;
  expected: {
    resources?: ExpectedResource[] | Record<string, ExpectedResourceSpec>;
    status?: KubernetesResource;
    conditions?: ExpectedCondition[];
    resourceCount?: number;
    resourceTypes?: string[];
  };
}

export interface TestCaseWithObserved {
  name: string;
  description?: string;
  input: {
    observed: {
      composite?: {
        resource: KubernetesResource;
      };
      resources?: Record<string, ObservedResource>;
    };
  };
  expected: {
    resources?: ExpectedResource[] | Record<string, ExpectedResourceSpec>;
    status?: KubernetesResource;
    conditions?: ExpectedCondition[];
    resourceCount?: number;
    resourceTypes?: string[];
  };
}

export interface ObservedResource {
  resource: {
    apiVersion: string;
    kind: string;
    metadata: KubernetesMetadata;
    spec?: KubernetesResource;
    status?: ResourceStatus;
  };
}

export interface ExpectedResource {
  name: string;
  kind: string;
  apiVersion: string;
  spec?: KubernetesResource;
  metadata?: ExpectedMetadata;
}

// For map-based resource expectations (without the name field)
export interface ExpectedResourceSpec {
  kind: string;
  apiVersion: string;
  spec?: KubernetesResource;
  metadata?: ExpectedMetadata;
}

export interface ExpectedCondition {
  type: string;
  status: string;
  reason?: string;
  message?: string;
}

/**
 * Load test cases from a YAML file
 */
export function loadTestCasesFromYaml(filePath: string): TestCase[] {
  const content = readFileSync(filePath, 'utf-8');
  const docs = parseAllDocuments(content);

  return docs
    .filter((doc) => doc.toJSON() !== null)
    .map((doc) => {
      const data = doc.toJSON();
      return {
        name: data.name || 'Unnamed test case',
        description: data.description,
        input: data.input,
        expected: data.expected || {},
      };
    });
}

/**
 * Load test cases from a JSON file
 */
export function loadTestCasesFromJson(filePath: string): TestCase[] {
  const content = readFileSync(filePath, 'utf-8');
  const data = JSON.parse(content);

  if (Array.isArray(data)) {
    return data;
  }

  return [data];
}

/**
 * Load test cases from either YAML or JSON based on file extension
 */
export function loadTestCases(filePath: string): TestCase[] {
  if (filePath.endsWith('.yaml') || filePath.endsWith('.yml')) {
    return loadTestCasesFromYaml(filePath);
  } else if (filePath.endsWith('.json')) {
    return loadTestCasesFromJson(filePath);
  }

  throw new Error(`Unsupported file format: ${filePath}`);
}

/**
 * Assert that a response contains expected resources
 * Supports both array format (legacy) and map format (new)
 */
export function assertResources(
  response: RunFunctionResponse,
  expectedResources: ExpectedResource[] | Record<string, ExpectedResourceSpec>
) {
  const desiredResources = response.desired?.resources || {};

  // Convert map format to array format for uniform processing
  const resourcesArray: ExpectedResource[] = Array.isArray(expectedResources)
    ? expectedResources
    : Object.entries(expectedResources).map(([name, spec]) => ({
        name,
        ...spec,
      }));

  for (const expected of resourcesArray) {
    const resourceKey = Object.keys(desiredResources).find((key) => {
      const resource = desiredResources[key];
      const resourceData = resource?.resource as KubernetesResource | undefined;

      return (
        (resourceData?.metadata as KubernetesMetadata | undefined)?.annotations?.[
          'crossplane.io/composition-resource-name'
        ] === expected.name || key === expected.name
      );
    });

    if (!resourceKey) {
      throw new Error(`Expected resource '${expected.name}' not found in response`);
    }

    const actualResource = desiredResources[resourceKey]?.resource as
      | KubernetesResource
      | undefined;
    if (!actualResource) {
      throw new Error(`Resource '${expected.name}' has no resource data`);
    }

    // Check kind and apiVersion
    if (expected.kind && actualResource.kind !== expected.kind) {
      throw new Error(
        `Resource '${expected.name}' has wrong kind. Expected: ${expected.kind}, Got: ${String(actualResource.kind)}`
      );
    }

    if (expected.apiVersion && actualResource.apiVersion !== expected.apiVersion) {
      throw new Error(
        `Resource '${expected.name}' has wrong apiVersion. Expected: ${expected.apiVersion}, Got: ${String(actualResource.apiVersion)}`
      );
    }

    // Check metadata if provided
    if (expected.metadata) {
      const actualMetadata = actualResource.metadata as KubernetesMetadata | undefined;

      if (
        expected.metadata.namespace &&
        actualMetadata?.namespace !== expected.metadata.namespace
      ) {
        throw new Error(
          `Resource '${expected.name}' has wrong namespace. Expected: ${expected.metadata.namespace}, Got: ${actualMetadata?.namespace}`
        );
      }

      if (expected.metadata.labels) {
        for (const [key, value] of Object.entries(expected.metadata.labels)) {
          if (actualMetadata?.labels?.[key] !== value) {
            throw new Error(`Resource '${expected.name}' missing label ${key}=${value}`);
          }
        }
      }
    }

    // Check spec if provided (partial match)
    if (expected.spec) {
      assertDeepPartialMatch(
        actualResource.spec,
        expected.spec,
        `Resource '${expected.name}' spec mismatch`
      );
    }
  }
}

/**
 * Assert that actual object contains all properties from expected (partial match)
 */
function assertDeepPartialMatch(actual: unknown, expected: unknown, path: string): void {
  if (expected === null || expected === undefined) {
    return;
  }

  if (typeof expected !== 'object') {
    if (actual !== expected) {
      const expectedStr = expected === undefined ? 'undefined' : JSON.stringify(expected);
      const actualStr = actual === undefined ? 'undefined' : JSON.stringify(actual);
      throw new Error(`${path}: Expected ${expectedStr}, got ${actualStr}`);
    }
    return;
  }

  if (Array.isArray(expected)) {
    if (!Array.isArray(actual)) {
      throw new Error(`${path}: Expected array, got ${typeof actual}`);
    }

    if (actual.length < expected.length) {
      throw new Error(`${path}: Expected at least ${expected.length} items, got ${actual.length}`);
    }

    for (let i = 0; i < expected.length; i++) {
      assertDeepPartialMatch(actual[i], expected[i], `${path}[${i}]`);
    }
    return;
  }

  // Type guard: at this point, expected is a non-null object
  // We need to verify actual is also an object before proceeding
  if (typeof actual !== 'object' || actual === null) {
    throw new Error(`${path}: Expected object, got ${typeof actual}`);
  }

  // Now we can safely access properties on both actual and expected
  const actualObj = actual as Record<string, unknown>;
  const expectedObj = expected as Record<string, unknown>;

  for (const key in expectedObj) {
    if (!Object.prototype.hasOwnProperty.call(actualObj, key)) {
      throw new Error(`${path}: Missing property '${key}'`);
    }

    assertDeepPartialMatch(actualObj[key], expectedObj[key], `${path}.${key}`);
  }
}

/**
 * Assert that response has expected status
 */
export function assertStatus(response: RunFunctionResponse, expectedStatus: KubernetesResource) {
  const actualStatus = response.desired?.composite?.resource?.status || {};

  assertDeepPartialMatch(actualStatus, expectedStatus, 'Composite status');
}

/**
 * Assert resource count
 */
export function assertResourceCount(response: RunFunctionResponse, expectedCount: number) {
  const actualCount = Object.keys(response.desired?.resources || {}).length;

  if (actualCount !== expectedCount) {
    throw new Error(`Expected ${expectedCount} resources, got ${actualCount}`);
  }
}

/**
 * Assert resource types
 */
export function assertResourceTypes(response: RunFunctionResponse, expectedTypes: string[]) {
  const desiredResources = response.desired?.resources || {};
  const actualTypes = new Set(
    Object.values(desiredResources).map((r) => {
      const resource = r.resource as KubernetesResource | undefined;
      return resource?.kind as string | undefined;
    })
  );

  for (const expectedType of expectedTypes) {
    if (!actualTypes.has(expectedType)) {
      throw new Error(
        `Expected resource type '${expectedType}' not found. Available types: ${Array.from(actualTypes).join(', ')}`
      );
    }
  }
}

/**
 * Run all assertions for a test case
 */
export function assertTestCase(response: RunFunctionResponse, testCase: TestCase) {
  if (testCase.expected.resources) {
    assertResources(response, testCase.expected.resources);
  }

  if (testCase.expected.status) {
    assertStatus(response, testCase.expected.status);
  }

  if (testCase.expected.resourceCount !== undefined) {
    assertResourceCount(response, testCase.expected.resourceCount);
  }

  if (testCase.expected.resourceTypes) {
    assertResourceTypes(response, testCase.expected.resourceTypes);
  }
}

/**
 * Helper to build an observed resource with status
 *
 * @example
 * const vpcObserved = buildObservedResource({
 *   name: 'vpc',
 *   kind: 'VPC',
 *   apiVersion: 'ec2.aws.m.upbound.io/v1beta1',
 *   status: {
 *     atProvider: {
 *       id: 'vpc-12345'
 *     }
 *   }
 * });
 */
export function buildObservedResource(config: {
  name: string;
  kind: string;
  apiVersion: string;
  metadata?: KubernetesMetadata;
  spec?: KubernetesResource;
  status?: ResourceStatus;
}): ObservedResource {
  return {
    resource: {
      apiVersion: config.apiVersion,
      kind: config.kind,
      metadata: {
        annotations: {
          'crossplane.io/composition-resource-name': config.name,
        },
        ...config.metadata,
      },
      ...(config.spec && { spec: config.spec }),
      ...(config.status && { status: config.status }),
    },
  };
}

/**
 * Helper to build a complete test input with observed resources
 *
 * @example
 * const input = buildTestInput({
 *   composite: { ... },
 *   observedResources: {
 *     vpc: buildObservedResource({ ... }),
 *     subnet: buildObservedResource({ ... })
 *   }
 * });
 */
/**
 * Test input structure for building RunFunctionRequest objects in tests
 * This is a partial RunFunctionRequest that can be passed to test functions
 */
export interface TestInput {
  observed: {
    composite: {
      resource: KubernetesResource;
    };
    resources?: Record<string, ObservedResource>;
  };
}

export function buildTestInput(config: {
  composite: KubernetesResource;
  observedResources?: Record<string, ObservedResource>;
}): RunFunctionRequest {
  // Return a partial request suitable for testing
  // The function will handle missing fields gracefully
  return {
    observed: {
      composite: {
        resource: config.composite,
      },
      ...(config.observedResources && { resources: config.observedResources }),
    },
  } as unknown as RunFunctionRequest;
}
