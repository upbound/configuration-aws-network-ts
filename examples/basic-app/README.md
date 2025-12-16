# Basic App Example

A simplified TypeScript-based Crossplane Composition Function that demonstrates direct usage of kubernetes-models to generate Kubernetes resources for basic application workloads.

## Overview

This example shows how to build a Crossplane function that creates Kubernetes resources directly using the kubernetes-models library, without helper functions. It generates Deployments, Services, ServiceAccounts, and Ingress resources based on a simplified API.

## Architecture

The function uses kubernetes-models directly:

- **function.ts** - Main function that creates Kubernetes resources inline using kubernetes-models classes
- Direct imports from:
  - `kubernetes-models/apps/v1` (Deployment)
  - `kubernetes-models/v1` (Service, ServiceAccount)
  - `kubernetes-models/networking.k8s.io/v1` (Ingress)

## Dependencies

**Note:** This project uses a **private copy** of `function-sdk-typescript` located at the root of this repository. The SDK is not yet published to npm and must be built locally.

### Building the SDK

From the repository root:

```bash
npm install
npm run build
```

## Usage

### Building the Function

```bash
npm install
npm run tsc
```

This function can also be built using Typescript 7:

```shell
npm run tsgo
```

### Running Locally

```bash
npm run local
```

### Docker Build

```bash
npm run docker-build
```

## Input Format

The function expects a simplified configuration in the composite resource spec. See
[example.yaml](example.yaml) and [example-full.yaml](example-full.yaml) for
example manifests.

```yaml
apiVersion: platform.upbound.io/v1
kind: BasicApp
metadata:
  name: my-app
  namespace: default
spec:
  parameters:
    name: my-app
    image:
      repository: nginx
      tag: "1.21"
      pullPolicy: IfNotPresent
    pod:
      replicaCount: 1
      resources:
        limits:
          cpu: 500m
          memory: 512Mi
    service:
      enabled: true
      type: ClusterIP
      port: 80
    serviceAccount:
      enabled: true
      name: my-app
    ingress:
      enabled: false
```

## Generated Resources

The function generates these resources:

1. **ServiceAccount** - If `serviceAccount.enabled` is not false (default: enabled)
2. **Service** - If `service.enabled` is not false (default: enabled)
3. **Deployment** - Always created
4. **Ingress** - If `ingress.enabled` is true

The namespace for resources is taken from the composite resource's metadata.namespace.

## Development

### Type Checking

```bash
npm run check-types
```

### Compilation

```bash
npm run tsc
```

### Rendering

First ensure the project is compiled using `npm run tsc`.

In one browser window run `npm run local` and in another window run `npm run render`. The
render default is to use the `example-full.yaml` manifest.

## Building the Docker Image

Version and registry settings are contained in the [env](env) file. Update this
to push to your Docker registry.

Run `npm run docker-build`. Tar files will be generated in the `_build/docker-images`
directory.

## Building the Crossplane XPKG Image

Once the Docker images have been built, run `npm run xpkg-build` to create the Crossplane
packages that embed the docker image.

## Pushing the Crossplane Package

### Deploying the Function

Apply the `functions.yaml` file to your Crossplane v2 Cluster:

```shell
$ kubectl apply -f functions.yaml
function.pkg.crossplane.io/crossplane-contrib-function-basic-app created
function.pkg.crossplane.io/crossplane-contrib-function-auto-ready created
```

**Note:** This example uses a **build version** of `function-auto-ready` that includes support for additional ready checks beyond the standard release. This enhanced version provides more comprehensive readiness detection for Kubernetes resources.

Ensure that the functions are installed and healthy:

```shell
kubectl get -f functions.yaml
NAME                                       INSTALLED   HEALTHY   PACKAGE                                                         AGE
crossplane-contrib-function-basic-app      True        True      index.docker.io/steve/function-basic-app:v0.0.1                 112s
crossplane-contrib-function-auto-ready     True        True      xpkg.upbound.io/crossplane-contrib/function-auto-ready:v0.5.2   112s
```

### Deploy the Composition

```shell
$ kubectl apply -f definition.yaml -f composition.yaml
compositeresourcedefinition.apiextensions.crossplane.io/basicapps.platform.upbound.io created
composition.apiextensions.crossplane.io/basicapps.platform.upbound.io created
```

#### Creating Permissions on the Crossplane Pod

The Crossplane Pod needs permissions to create the resources. A
Kubernetes ClusterRole has been created to grant permissions to
objects in this Composition:

```shell
$ kubectl apply -f clusterrole.yaml 
clusterrole.rbac.authorization.k8s.io/app-manager unchanged
```

### Creating Resources

Run:

```shell
$ kubectl apply -f example-full.yaml
app.platform.upbound.io/example-full created
```

## References

- Original KCL implementation: [upbound/configuration-app-model](https://github.com/upbound/configuration-app-model)
- Crossplane Composition Functions: [Crossplane Docs](https://docs.crossplane.io/latest/concepts/composition-functions/)
