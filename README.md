# Crossplane AWS Network Configuration in TypeScript <!-- omit from toc -->

This repository contains a TypeScript implementation of [configuration-aws-network](https://github.com/upbound/configuration-aws-network), using Crossplane's [function-sdk-typescript](https://www.npmjs.com/package/@crossplane-org/function-sdk-typescript).

It is packaged as a [Crossplane project](https://docs.crossplane.io/latest/cli/), so the configuration and its embedded composition function are built, rendered, and pushed with the `crossplane` CLI rather than hand-written Docker and packaging scripts.

> **Note:** TypeScript embedded functions require a `crossplane` CLI that includes
> [crossplane/cli#170](https://github.com/crossplane/cli/pull/170).

- [Installing and Running the Configuration and Function](#installing-and-running-the-configuration-and-function)
  - [Installation of the Package](#installation-of-the-package)
  - [Configuring AWS Authentication](#configuring-aws-authentication)
    - [AWS static credentials](#aws-static-credentials)
  - [Create the ProviderConfig](#create-the-providerconfig)
  - [Create the Example](#create-the-example)
  - [Deleting the Example](#deleting-the-example)
- [Project Structure](#project-structure)
- [Development](#development)
  - [Building the Crossplane CLI](#building-the-crossplane-cli)
  - [Generating Schemas](#generating-schemas)
  - [Updating the Function](#updating-the-function)
  - [Type Checking and Tests](#type-checking-and-tests)
  - [Rendering the Composition](#rendering-the-composition)
  - [Running a Local Dev Cluster](#running-a-local-dev-cluster)
  - [Available CLI Options](#available-cli-options)
- [Building and Pushing the Project](#building-and-pushing-the-project)
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
  package: xpkg.upbound.io/upbound/configuration-aws-network-ts:v0.3.0
```

Verify the package is healthy. If not, run `kubectl describe configuration.pkg configuration-aws-network`.

```sh
$ kubectl get configuration.pkg  configuration-aws-network
NAME                        INSTALLED   HEALTHY   PACKAGE                                                           AGE
configuration-aws-network   True        True      xpkg.upbound.io/upbound/configuration-aws-network-ts:v0.3.0   18m
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
├── crossplane-project.yaml       # Project metadata, dependencies, schema languages
├── apis/
│   └── network/
│       ├── definition.yaml       # CompositeResourceDefinition (XRD)
│       ├── composition.yaml      # Composition pipeline
│       └── mrap.yaml             # ManagedResourceActivationPolicy for the EC2 MRs
├── examples/
│   └── network/                  # Example Network manifests
├── functions/
│   └── network/                  # Embedded TypeScript composition function
│       ├── package.json
│       ├── tsconfig.json
│       ├── vitest.config.ts
│       ├── src/
│       │   ├── function.ts       # Function logic
│       │   └── main.ts           # Entrypoint — hands the function to serve()
│       └── test/
│           ├── function.test.ts
│           ├── test-helpers.ts
│           └── test-cases/       # YAML/JSON driven test fixtures
├── operations/                   # Crossplane Operations (unused)
├── tests/                        # Crossplane composition tests (unused)
├── schemas/                      # Generated — not checked in
│   └── typescript/               # crossplane-models package
└── _output/                      # Built packages — not checked in
```

## Development

### Building the Crossplane CLI

Everything below needs a `crossplane` CLI with [crossplane/cli#170](https://github.com/crossplane/cli/pull/170),
which is not in a release yet. Until it lands, build it from the branch:

```bash
git clone --branch project-typescript-support https://github.com/stevendborrelli/cli.git
cd cli
go build -o crossplane ./cmd/crossplane
```

Building needs the Go version in that repository's `go.mod` (currently 1.26). Put the resulting
binary on your `PATH`, ahead of any released `crossplane` you already have:

```bash
sudo mv crossplane /usr/local/bin/crossplane
```

Note that a CLI built from source reports an empty client version, because the version is stamped
in at release time — that is expected, not a broken build. Confirm it works by generating the
schemas below instead.

[CI](.github/workflows/ci.yaml) builds the CLI the same way, in its `cli` job. Once a release
includes the TypeScript project support, this section goes away and the CLI can be installed
from a release as normal.

### Generating Schemas

`spec.schemas.languages` in [crossplane-project.yaml](crossplane-project.yaml) is set to
`typescript`, so the CLI generates a `crossplane-models` npm package into `schemas/typescript/`
from the CRDs of every dependency plus the XRDs in `apis/`. The function depends on it as a
`file:` dependency, so the schemas must exist before `npm install` will work:

```bash
crossplane project build
```

The function imports the namespaced (v2) EC2 types from it:

```typescript
import { VPC, Subnet } from 'crossplane-models/ec2.aws.m.upbound.io/v1beta1';
```

### Updating the Function

All the logic of the function is in [functions/network/src/function.ts](functions/network/src/function.ts).

To create a resource:

1. Create a new type (like a VPC).
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

desiredComposed['vpc'] = fromModel(vpc);
```

`fromModel()` is the SDK helper for turning a kubernetes-models object into a composed
resource. `validate()` stays a separate call: values read off the XR are untyped at runtime,
so it is the only thing that catches a missing or wrong-typed field before the resource is
sent to the API server.

If you add a new managed resource kind, add its CRD name to
[apis/network/mrap.yaml](apis/network/mrap.yaml) so Crossplane activates it.

### Type Checking and Tests

All npm commands run inside `functions/network`:

```bash
cd functions/network
npm install
npm run build   # compile with tsc (TypeScript 7) into dist/
npm test        # vitest
```

### Rendering the Composition

`crossplane composition render` builds the embedded function and runs the pipeline locally —
no cluster and no separately-started function process required. The first run pulls the Node
build image and runs `npm install`, so give it a generous timeout:

```bash
crossplane composition render \
  examples/network/configuration-aws-network.yaml \
  apis/network/composition.yaml \
  --timeout=10m
```

Add `--include-function-results` to see the function's own messages, or `--include-full-xr`
to see the composite's spec and status.

### Running a Local Dev Cluster

`crossplane project run` builds this project into a Kind cluster running Crossplane. On its own
that leaves you with a cluster that cannot reach AWS and has no namespace to compose into, so
pass both along:

```bash
crossplane project run \
  --init-resources=examples/network/namespace-network-team.yaml \
  --extra-resources=examples/network/providerconfig.yaml

crossplane project stop    # tear it down
```

`--init-resources` applies the `network-team` namespace before the project installs, so the
ProviderConfig and the composed resources have somewhere to land. `--extra-resources` then
applies the ProviderConfig and the `aws-creds` secret it references.

[examples/network/providerconfig.yaml](examples/network/providerconfig.yaml) ships with
`REPLACE_ME` placeholders — fill in the same `[default]` credentials described under
[AWS static credentials](#aws-static-credentials) before running.

The ProviderConfig and the `aws-creds` secret it references live in this one file on purpose,
so that automated testing can bring both up with a single `--extra-resources` argument.

> **Do not commit real credentials.** The file is tracked and carries the secret inline, so an
> edited copy is one `git add .` away from being published. Before filling it in, tell git to
> ignore your changes to it:
>
> ```bash
> git update-index --skip-worktree examples/network/providerconfig.yaml
> ```
>
> Adding the path to `.gitignore` will not do it — gitignore only applies to untracked files,
> and this one is tracked. `skip-worktree` is the equivalent for a tracked file. To pick the
> file up again later — say to change the placeholders themselves — reverse it with
> `--no-skip-worktree`.

There is also a pre-commit hook in [.githooks/](.githooks/) that refuses any commit staging
this file without its placeholders, or staging an AWS access key or secret key in any other
file. It is worth enabling once per clone:

```bash
git config core.hooksPath .githooks
```

Hooks are not installed by cloning, so this is opt-in — it protects you, not the repository.
`git commit --no-verify` bypasses it.

Once it is up, apply the example as normal:

```bash
kubectl apply -f examples/network/configuration-aws-network.yaml
```

### Available CLI Options

The function binary supports several CLI options:

- `--address` - Address to listen for gRPC connections (default: `0.0.0.0:9443`)
- `-d, --debug` - Enable debug logging
- `--insecure` - Run without mTLS credentials (for local development)
- `--tls-server-certs-dir` - Directory containing mTLS certificates (default: `/tls/server`)
- `-h, --help` - Show the flags and exit

To run it directly:

```bash
cd functions/network && npm run local
```

## Building and Pushing the Project

`crossplane project build` generates the schemas, builds the embedded function image for every
architecture in `spec.architectures`, and writes a configuration package to `_output/`:

```bash
crossplane project build
```

`crossplane project push` uploads the configuration package and every embedded function package
it references:

```bash
crossplane project push --tag v0.3.0
```

Both run in [CI](.github/workflows/ci.yaml) on every push.

## License

Apache-2.0

## Author

Stefano Borrelli <steve@borrelli.org>
