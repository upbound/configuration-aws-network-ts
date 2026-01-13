import { readFileSync } from 'fs';
import { parse as parseYaml, parseAllDocuments } from 'yaml';
import { RunFunctionRequest, RunFunctionResponse } from '@crossplane-org/function-sdk-typescript';

export interface TestCase {
    name: string;
    description?: string;
    input: RunFunctionRequest;
    expected: {
        resources?: ExpectedResource[] | Record<string, ExpectedResourceSpec>;
        status?: Record<string, any>;
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
                resource: any;
            };
            resources?: Record<string, ObservedResource>;
        };
    };
    expected: {
        resources?: ExpectedResource[] | Record<string, ExpectedResourceSpec>;
        status?: Record<string, any>;
        conditions?: ExpectedCondition[];
        resourceCount?: number;
        resourceTypes?: string[];
    };
}

export interface ObservedResource {
    resource: {
        apiVersion: string;
        kind: string;
        metadata: any;
        spec?: any;
        status?: {
            atProvider?: Record<string, any>;
            conditions?: any[];
            [key: string]: any;
        };
    };
}

export interface ExpectedResource {
    name: string;
    kind: string;
    apiVersion: string;
    spec?: Record<string, any>;
    metadata?: {
        labels?: Record<string, string>;
        annotations?: Record<string, string>;
        namespace?: string;
    };
}

// For map-based resource expectations (without the name field)
export interface ExpectedResourceSpec {
    kind: string;
    apiVersion: string;
    spec?: Record<string, any>;
    metadata?: {
        labels?: Record<string, string>;
        annotations?: Record<string, string>;
        namespace?: string;
    };
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
        .filter(doc => doc.toJSON() !== null)
        .map(doc => {
            const data = doc.toJSON() as any;
            return {
                name: data.name || 'Unnamed test case',
                description: data.description,
                input: data.input,
                expected: data.expected || {}
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
            ...spec
        }));

    for (const expected of resourcesArray) {
        const resourceKey = Object.keys(desiredResources).find(key => {
            const resource = desiredResources[key];
            const resourceData = resource?.resource as any;

            return resourceData?.metadata?.annotations?.['crossplane.io/composition-resource-name'] === expected.name ||
                   key === expected.name;
        });

        if (!resourceKey) {
            throw new Error(`Expected resource '${expected.name}' not found in response`);
        }

        const actualResource = desiredResources[resourceKey]?.resource as any;

        // Check kind and apiVersion
        if (expected.kind && actualResource.kind !== expected.kind) {
            throw new Error(
                `Resource '${expected.name}' has wrong kind. Expected: ${expected.kind}, Got: ${actualResource.kind}`
            );
        }

        if (expected.apiVersion && actualResource.apiVersion !== expected.apiVersion) {
            throw new Error(
                `Resource '${expected.name}' has wrong apiVersion. Expected: ${expected.apiVersion}, Got: ${actualResource.apiVersion}`
            );
        }

        // Check metadata if provided
        if (expected.metadata) {
            if (expected.metadata.namespace && actualResource.metadata?.namespace !== expected.metadata.namespace) {
                throw new Error(
                    `Resource '${expected.name}' has wrong namespace. Expected: ${expected.metadata.namespace}, Got: ${actualResource.metadata?.namespace}`
                );
            }

            if (expected.metadata.labels) {
                for (const [key, value] of Object.entries(expected.metadata.labels)) {
                    if (actualResource.metadata?.labels?.[key] !== value) {
                        throw new Error(
                            `Resource '${expected.name}' missing label ${key}=${value}`
                        );
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
function assertDeepPartialMatch(
    actual: any,
    expected: any,
    path: string
): void {
    if (expected === null || expected === undefined) {
        return;
    }

    if (typeof expected !== 'object') {
        if (actual !== expected) {
            throw new Error(`${path}: Expected ${expected}, got ${actual}`);
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

    for (const key in expected) {
        if (!actual.hasOwnProperty(key)) {
            throw new Error(`${path}: Missing property '${key}'`);
        }

        assertDeepPartialMatch(actual[key], expected[key], `${path}.${key}`);
    }
}

/**
 * Assert that response has expected status
 */
export function assertStatus(
    response: RunFunctionResponse,
    expectedStatus: Record<string, any>
) {
    const actualStatus = response.desired?.composite?.resource?.status || {};

    assertDeepPartialMatch(
        actualStatus,
        expectedStatus,
        'Composite status'
    );
}

/**
 * Assert resource count
 */
export function assertResourceCount(
    response: RunFunctionResponse,
    expectedCount: number
) {
    const actualCount = Object.keys(response.desired?.resources || {}).length;

    if (actualCount !== expectedCount) {
        throw new Error(
            `Expected ${expectedCount} resources, got ${actualCount}`
        );
    }
}

/**
 * Assert resource types
 */
export function assertResourceTypes(
    response: RunFunctionResponse,
    expectedTypes: string[]
) {
    const desiredResources = response.desired?.resources || {};
    const actualTypes = new Set(
        Object.values(desiredResources).map(r => (r.resource as any)?.kind)
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
export function assertTestCase(
    response: RunFunctionResponse,
    testCase: TestCase
) {
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
    metadata?: any;
    spec?: any;
    status?: {
        atProvider?: Record<string, any>;
        conditions?: any[];
        [key: string]: any;
    };
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
export function buildTestInput(config: {
    composite: any;
    observedResources?: Record<string, ObservedResource>;
}): any {
    return {
        observed: {
            composite: {
                resource: config.composite,
            },
            ...(config.observedResources && { resources: config.observedResources }),
        },
    };
}
