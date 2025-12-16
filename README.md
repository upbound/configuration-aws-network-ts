# Crossplane Function Template - TypeScript

A template for building Crossplane composition functions in TypeScript using the [function-sdk-typescript](https://github.com/upbound/function-sdk-typescript).

## Overview

This template provides a starting point for developing Crossplane functions that can transform, validate, and generate Kubernetes resources within Crossplane compositions. The example function creates sample Deployment and Pod resources.

## Prerequisites

- Node.js 25 or later
- npm
- Docker (for building container images)
- TypeScript versions 5+  (tsgo can compile the project)

## Project Structure

```
.
├── functionn.ts              # Main function implementation
├── main.ts            # Entry point and server setup
├── package.json       # Dependencies and scripts
├── tsconfig.json      # TypeScript configuration
├── Dockerfile         # Container image definition
└── function-sdk-typescript/  # Local copy of the SDK (private repo)
```

## Installation

1. Clone this repository
2. Ensure the `function-sdk-typescript` SDK is present in the project directory
3. Install dependencies:

```bash
npm install
```

## Development

### Build TypeScript

Compile TypeScript to JavaScript:

```bash
npm run tsc
```

Typescript 7 can also be used:

```bash
npm run tsgo
```

### Type Checking

Check types without emitting files:

```bash
npm run check-types
```

### Running Locally

Run the function server in insecure mode for local testing:

```bash
node dist/main.js --insecure --debug
```

### Available CLI Options

- `--address` - Address to listen for gRPC connections (default: `0.0.0.0:9443`)
- `-d, --debug` - Enable debug logging
- `--insecure` - Run without mTLS credentials (for local development)
- `--tls-server-certs-dir` - Directory containing mTLS certificates (default: `/tls/server`)

## Docker Build

Build the container image:

```bash
docker build -t function-template-typescript .
```

The Dockerfile uses a multi-stage build:

1. **Build stage**: Uses `node:25` to install dependencies and compile TypeScript
2. **Runtime stage**: Uses `gcr.io/distroless/nodejs24-debian12` for a minimal, secure runtime

## Examples

### Basic App Example

The [examples/basic-app](examples/basic-app) directory contains a complete example that demonstrates building a real-world Crossplane function. This example creates Kubernetes application resources (Deployments, Services, ServiceAccounts, and Ingress) based on a simplified API specification.

**Key Features:**

- Direct usage of `kubernetes-models` for type-safe resource creation
- Generates multiple related Kubernetes resources from a single composite resource
- Includes complete Crossplane configuration (XRD, Composition, and example claims)
- Demonstrates building and packaging functions as Crossplane packages (xpkg)
- Shows integration with `function-auto-ready` for resource readiness checks

**What You'll Learn:**
- Creating Kubernetes resources using `kubernetes-models` classes
- Working with composite resource specifications
- Conditional resource generation based on input parameters
- Building and deploying production-ready Crossplane functions
- Creating Crossplane packages for distribution

See the [basic-app README](examples/basic-app/README.md) for detailed instructions on building, testing, and deploying this example.

## Implementation Guide

### Creating Your Function

Edit `fn.ts` to implement your function logic. The main interface is:

```typescript
export class Function implements FunctionHandler {
    async RunFunction(
        req: RunFunctionRequest,
        logger?: Logger,
    ): Promise<RunFunctionResponse> {
        // Your function logic here
    }
}
```

### Key SDK Functions

The SDK provides helper functions for working with Crossplane resources:

- `getObservedCompositeResource(req)` - Get the observed composite resource (XR)
- `getDesiredCompositeResource(req)` - Get the desired composite resource
- `getObservedComposedResources(req)` - Get observed composed resources
- `getDesiredComposedResources(req)` - Get desired composed resources
- `setDesiredComposedResources(rsp, resources)` - Set desired composed resources
- `Resource.fromJSON()` - Create resources from JSON
- `normal(rsp, message)` - Add a normal condition to the response
- `fatal(rsp, message)` - Add a fatal condition to the response
- `to(req)` - Create a minimal response from a request

### Example: Creating a Resource

```typescript
import { Resource } from "function-sdk-typescript";

// Create from JSON
const resource = Resource.fromJSON({
    resource: {
        apiVersion: "v1",
        kind: "ConfigMap",
        metadata: {
            name: "my-config",
            namespace: "default",
        },
        data: {
            key: "value",
        },
    },
});

// Add to desired composed resources
dcds["my-config"] = resource;
```

### Using Kubernetes Models

The template includes [kubernetes-models](https://github.com/tommy351/kubernetes-models-ts) for type-safe K8s resource creation:

```typescript
import { Pod } from "kubernetes-models/v1";

const pod = new Pod({
    metadata: {
        name: "my-pod",
        namespace: "default",
    },
    spec: {
        containers: [{
            name: "app",
            image: "nginx:latest",
        }],
    },
});

pod.validate(); // Validate the resource

dcds["my-pod"] = Resource.fromJSON({ resource: pod.toJSON() });
```

## TypeScript Configuration

This template uses strict TypeScript settings:

- `strict: true` - All strict type checking options
- `noUncheckedIndexedAccess: true` - Safer array/object access
- `exactOptionalPropertyTypes: true` - Stricter optional properties
- `verbatimModuleSyntax: true` - Explicit import/export syntax

The SDK directory is excluded from compilation to avoid conflicts with different TypeScript settings.

## Dependencies

### Production Dependencies
- `function-sdk-typescript` - Crossplane function SDK (local copy)
- `commander` - CLI argument parsing
- `pino` - Structured logging
- `kubernetes-models` - Type-safe Kubernetes resource models
- `typescript` - TypeScript compiler
- `@types/node` - Node.js type definitions

### Dev Dependencies

- `@typescript/native-preview` - TypeScript native preview tooling

## Notes

- The `function-sdk-typescript` is a private repository and must be copied locally into the project
- The SDK directory is excluded from TypeScript compilation to prevent config conflicts
- The Docker build includes the SDK copy in the build context
- mTLS is enabled by default when running in production (disable with `--insecure` for local dev)

## Troubleshooting

### TypeScript Compilation Errors

If you encounter TypeScript errors related to the SDK:
1. Ensure `function-sdk-typescript` is in the exclude list in `tsconfig.json`
2. Run `npm install` to ensure dependencies are properly linked
3. Check that the SDK's `dist` directory contains compiled JavaScript

### Docker Build Failures

If the Docker build fails:
1. Ensure `function-sdk-typescript` directory exists in the project root
2. Verify `.dockerignore` doesn't exclude the SDK directory
3. Check that `package.json` references `file:./function-sdk-typescript`

## License

Apache-2.0

## Author

Steven Borrelli <steve@borrelli.org>
