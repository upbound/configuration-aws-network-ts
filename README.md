# Crossplane Function Template - TypeScript <!-- omit from toc -->

This repository contains a Typescript implementation of [configuration-aws-network](https://github.com/upbound/configuration-aws-network), using Crossplane's [function-sdk-typescript](https://www.npmjs.com/package/@crossplane-org/function-sdk-typescript).

- [Installing and Running the Configuration and Function](#installing-and-running-the-configuration-and-function)
  - [Installation of the Package](#installation-of-the-package)
  - [Configuring AWS Authentication](#configuring-aws-authentication)
    - [AWS static credentials](#aws-static-credentials)
  - [Create the ProviderConfig](#create-the-providerconfig)
  - [Create the Example](#create-the-example)
  - [Deleting the Example](#deleting-the-example)
- [Project Structure](#project-structure)
- [Development](#development)
- [Updating the Function](#updating-the-function)
  - [Build TypeScript](#build-typescript)
  - [Type Checking](#type-checking)
  - [Running Locally](#running-locally)
  - [Available CLI Options](#available-cli-options)
- [Packaging the Function and the Configuration](#packaging-the-function-and-the-configuration)
  - [Function](#function)
    - [Function Docker Build](#function-docker-build)
    - [Function Crossplane Package Build](#function-crossplane-package-build)
    - [Pushing the Function Package](#pushing-the-function-package)
  - [Configuration](#configuration)
  - [Configuration Package Build](#configuration-package-build)
  - [Configuration Package Push](#configuration-package-push)
- [License](#license)
- [Author](#author)


## Installing and Running the Configuration and Function

### Installation of the Package

The Configuration Package can be installed using a manifest. The package will install the function and AWS providers as dependencies.

```shell
apiVersion: pkg.crossplane.io/v1
kind: Configuration
metadata:
  name: configuration-aws-network
spec:
  package: xpkg.upbound.io/upboundcare/configuration-aws-network-ts:v0.0.8
```

Verify the package is healthy. If not, run `kubectl describe configuration.pkg configuration-aws-network`.

```sh
$ kubectl get configuration.pkg  configuration-aws-network 
NAME                        INSTALLED   HEALTHY   PACKAGE                                                           AGE
configuration-aws-network   True        True      xpkg.upbound.io/upboundcare/configuration-aws-network-ts:v0.0.8   18m
```

### Configuring AWS Authentication

Before running the example, we will need to configure authentication to the AWS API.

#### AWS static credentials

AWS Static credentials can be useful in testing, but more secure methods like IRSA or WebIdentity should
be used in production, see [AUTHENTICATION.md](https://github.com/crossplane-contrib/provider-upjet-aws/blob/main/AUTHENTICATION.md) for more information.

Create `[default]` credentials config file from AWS that contains the access key, secret access key and
optionally the session token:

```ini
[default]
aws_access_key_id=ASIA.....
aws_secret_access_key=5XgS...
aws_session_token=IQoJb3H...
```

Next, create a kubernetes secret from this file:

```shell
kubectl create secret generic aws-creds -n crossplane-system --from-file=creds=creds.conf
```

### Create the ProviderConfig

The ProviderConfig sets up authentication for the resource. Since we are using a secret, we will use a `source: Secret` in the configuration. The example will create resources in the `network-team` namespace, so the ProviderConfig will be created in the same namespace:

```shell
kubectl create ns network-team
```

```shell 
$ cat <<'EOF' | kubectl apply -f -
apiVersion: aws.m.upbound.io/v1beta1
kind: ProviderConfig
metadata:
  name: default
  namespace: network-team
spec:
  credentials:
    source: Secret
    secretRef:
      name: aws-creds
      namespace: crossplane-system
      key: creds
EOF
```

### Create the Example

Now apply the example manifest at [examples/network/configuration-aws-network.yaml](examples/network/configuration-aws-network.yaml).

```shell
$ kubectl apply -f examples/network/configuration-aws-network.yaml 
network.aws.platform.upbound.io/configuration-aws-network created
```

Watch the progress of the composition using `crossplane beta trace`:

```shell
crossplane beta trace -n network-team network.aws.platform.upbound.io/configuration-aws-network                            S

NAME                                                                                 SYNCED   READY   STATUS
Network/configuration-aws-network (network-team)                                     True     True    Available
├─ InternetGateway/configuration-aws-network-86880a2c0461 (network-team)             True     True    Available
├─ MainRouteTableAssociation/configuration-aws-network-f4b5988c90f5 (network-team)   True     True    Available
├─ RouteTableAssociation/configuration-aws-network-2e2a0cb68ab8 (network-team)       True     True    Available
├─ RouteTableAssociation/configuration-aws-network-57c4e3e03aa8 (network-team)       True     True    Available
├─ RouteTableAssociation/configuration-aws-network-7669785a9ee0 (network-team)       True     True    Available
├─ RouteTableAssociation/configuration-aws-network-d0ade4f595fb (network-team)       True     True    Available
├─ RouteTable/configuration-aws-network-4febc5d559a4 (network-team)                  True     True    Available
├─ Route/configuration-aws-network-987ac7b6b283 (network-team)                       True     True    Available
├─ SecurityGroupRule/configuration-aws-network-3064b2116c58 (network-team)           True     True    Available
├─ SecurityGroupRule/configuration-aws-network-f44882ae4f21 (network-team)           True     True    Available
├─ SecurityGroup/configuration-aws-network-4e91c030ba97 (network-team)               True     True    Available
├─ Subnet/configuration-aws-network-02e5d0d89c09 (network-team)                      True     True    Available
├─ Subnet/configuration-aws-network-0cfac105d82f (network-team)                      True     True    Available
├─ Subnet/configuration-aws-network-1492137b191f (network-team)                      True     True    Available
├─ Subnet/configuration-aws-network-fe2b7c268226 (network-team)                      True     True    Available
└─ VPC/configuration-aws-network-ba1005ecd45f (network-team)                         True     True    Available
```

### Deleting the Example

```shell
kubectl delete -n network-team network.aws.platform.upbound.io/configuration-aws-network   
```

## Project Structure

```sh
.
├── Dockerfile           # Dockerfile to build a runnable function
├── README.md
├── apis                 # Crossplane XRD and Composition files
├── dist                 # Compiled Artifacts
├── env                  # Build Environment variables
├── examples             # Example manifests
├── function.ts          # Function logic
├── jest.config.js       # Jest test config
├── main.ts              # Set up function runtime
├── node_modules
├── package.json
├── scripts             # Scripts to build and push function images
└── tsconfig.json
```

## Development

## Updating the Function

All the logic of the function is located in [function.ts]. This project contains Typescript types from at <https://www.npmjs.com/package/@crossplane-models/provider-upjet-aws>, which has all the resources in the 2.x upjet-based providers.

To create a resource:

1. Create a new type (like a VPC)
2. Run `validate()` against the resource.
3. Add the resource to the `desiredComposed` map.

Below is an example for the VPC resource.

```typescript
const vpc = new VPC({
                metadata: {
                    ...commonMetadata,
                },
                spec: {
                    ...commonSpec,
                    forProvider: {
                        cidrBlock: observedComposite?.resource?.spec?.parameters
                            ?.vpcCidrBlock,
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

            desiredComposed["vpc"] = Resource.fromJSON({
                resource: vpc.toJSON(),
            });
```

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

After compiling the source code, the function can be run locally for 
testing with `crossplane render` either directly via `node` or via `npm`:

```bash
node dist/main.js --insecure --debug
```

Using `npm run`:

```bash
npm run local
```

Combining these commands to run a clean build:

```shell
npm run clean && npm run tsgo && npm run local
```

The function must be shut down using before running locally again.

### Available CLI Options

The function supports several CLI options:

- `--address` - Address to listen for gRPC connections (default: `0.0.0.0:9443`)
- `-d, --debug` - Enable debug logging
- `--insecure` - Run without mTLS credentials (for local development)
- `--tls-server-certs-dir` - Directory containing mTLS certificates (default: `/tls/server`)

## Packaging the Function and the Configuration

Scripts are provided to build Crossplane packages for the Function and the Configuration
that uses the function.

The [`env`](env) file contains environment variable to set the version and Docker repository.

### Function

The function runs as a Kubernetes pod, which requires a docker image.

#### Function Docker Build

The function package runs in a Docker/OCI image. To create a multi-platform image, run
via npm or the shell script directly:

```bash
npm run function-docker-build 
```

or:

```bash
scripts/function-docker-build.sh
```

The Dockerfile uses a multi-stage build:

1. **Build stage**: Uses `node:25` to install dependencies and compile TypeScript
2. **Runtime stage**: Uses `gcr.io/distroless/nodejs24-debian12` for a minimal, secure runtime

The images will be saved in the `_build/docker` directory:

```bash
$ ls -al _build/docker_images 
configuration-aws-network-ts-function-runtime-amd64-v0.0.8.tar
configuration-aws-network-ts-function-runtime-arm64-v0.0.8.tar
```

#### Function Crossplane Package Build

Now that docker images have been created, build the Crossplane function packages.

```bash
npm run function-xpkg-build 
```

or:

```bash
scripts/function-xpkg-build.sh
```

The created function images will be in the `_build/xpkg` directory:

```shell
$ ls _build/xpkg 
configuration-aws-network-ts-function-amd64-v0.0.8.xpkg
configuration-aws-network-ts-function-arm64-v0.0.8.xpkg
```

#### Pushing the Function Package

Push the packages to any docker registry. The registry can be changed via the [`env`](env) file:

```bash
npm run function-xpkg-push
```

or:

```bash
scripts/function-xpkg-push.sh
```

### Configuration

The Configuration Package contains the CompositeResourceDefinition, Composition, and Dependencies. Configuration
files are located in the [`package`](package) directory.

### Configuration Package Build

```bash
npm run configuration-xpkg-build
```

or:

```bash
scripts/configuration-xpkg-build.sh
```

The package will be created as `_build/xpkg/configuration-aws-network-ts-v${VERSION}.xpkg`

### Configuration Package Push

Push the packages to any docker registry. The registry can be changed via the [`env`](env) file:

```bash
npm run configuration-xpkg-push
```

or:

```bash
scripts/configuration-xpkg-push.sh
```

## License

Apache-2.0

## Author

Stefano Borrelli <steve@borrelli.org>
