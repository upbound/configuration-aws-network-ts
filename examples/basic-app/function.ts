import {
    Resource,
    RunFunctionRequest,
    RunFunctionResponse,
    fatal,
    normal,
    setDesiredComposedResources,
    to,
    getDesiredComposedResources,
    getObservedCompositeResource,
    type FunctionHandler,
    type Logger,
} from "function-sdk-typescript";
import { Deployment } from "kubernetes-models/apps/v1";
import { Service } from "kubernetes-models/v1";
import { ServiceAccount } from "kubernetes-models/v1";
import { Ingress } from "kubernetes-models/networking.k8s.io/v1";

export class Function implements FunctionHandler {
    async RunFunction(
        req: RunFunctionRequest,
        logger?: Logger,
    ): Promise<RunFunctionResponse> {
        const startTime = Date.now();
        let rsp = to(req);

        try {
            // Get the observed composite resource
            const oxr = getObservedCompositeResource(req);
            logger?.debug({ oxr }, "Observed composite resource");

            // Get existing desired composed resources
            let dcds = getDesiredComposedResources(req);

            // Extract parameters from XR spec
            const params = oxr?.resource?.spec?.parameters || {};
            const name = params.name || "app";
            const namespace = oxr?.resource?.metadata?.namespace;
            const imageConfig = params.image || {};
            const podConfig = params.pod || {};
            const serviceConfig = params.service || {};
            const ingressConfig = params.ingress || {};
            const serviceAccountConfig = params.serviceAccount || {};

            // Common metadata for all resources
            const commonMetadata = {
                name: name,
                ...(namespace && { namespace: namespace }),
                labels: {
                    "app.kubernetes.io/name": name,
                    "app.kubernetes.io/instance": name,
                    "app.kubernetes.io/managed-by": "crossplane",
                },
            };

            // Create ServiceAccount if enabled
            if (serviceAccountConfig.enabled !== false) {
                const serviceAccount = new ServiceAccount({
                    metadata: {
                        ...commonMetadata,
                        ...(serviceAccountConfig.name && { name: serviceAccountConfig.name }),
                        ...(serviceAccountConfig.annotations && {
                            annotations: serviceAccountConfig.annotations
                        }),
                    },
                    automountServiceAccountToken: true,
                });

                dcds["serviceaccount"] = Resource.fromJSON({
                    resource: serviceAccount.toJSON(),
                });
            }

            // Create Service if enabled
            if (serviceConfig.enabled !== false) {
                const service = new Service({
                    metadata: commonMetadata,
                    spec: {
                        type: serviceConfig.type || "ClusterIP",
                        ports: [
                            {
                                port: serviceConfig.port || 80,
                                targetPort: "http" as any,
                                protocol: "TCP",
                                name: "http",
                            },
                        ],
                        selector: {
                            "app.kubernetes.io/name": name,
                            "app.kubernetes.io/instance": name,
                        },
                    },
                });

                dcds["service"] = Resource.fromJSON({
                    resource: service.toJSON(),
                });
            }

            // Create Deployment
            const deployment = new Deployment({
                metadata: commonMetadata,
                spec: {
                    replicas: podConfig.replicaCount || 1,
                    selector: {
                        matchLabels: {
                            "app.kubernetes.io/name": name,
                            "app.kubernetes.io/instance": name,
                        },
                    },
                    template: {
                        metadata: {
                            labels: {
                                "app.kubernetes.io/name": name,
                                "app.kubernetes.io/instance": name,
                            },
                        },
                        spec: {
                            serviceAccountName: serviceAccountConfig.name || name,
                            ...(podConfig.podSecurityContext && {
                                securityContext: podConfig.podSecurityContext,
                            }),
                            containers: [
                                {
                                    name: name,
                                    image: `${imageConfig.repository || "nginx"}:${imageConfig.tag || "latest"}`,
                                    imagePullPolicy: imageConfig.pullPolicy || "IfNotPresent",
                                    ports: [
                                        {
                                            name: "http",
                                            containerPort: serviceConfig.port || 80,
                                            protocol: "TCP",
                                        },
                                    ],
                                    ...(podConfig.securityContext && {
                                        securityContext: podConfig.securityContext,
                                    }),
                                    ...(podConfig.resources && {
                                        resources: podConfig.resources,
                                    }),
                                },
                            ],
                        } as any,
                    },
                },
            });

            dcds["deployment"] = Resource.fromJSON({
                resource: deployment.toJSON(),
            });

            // Create Ingress if enabled
            if (ingressConfig.enabled) {
                const ingress = new Ingress({
                    metadata: {
                        ...commonMetadata,
                        ...(ingressConfig.annotations && {
                            annotations: ingressConfig.annotations,
                        }),
                    },
                    spec: {
                        ...(ingressConfig.className && {
                            ingressClassName: ingressConfig.className,
                        }),
                        ...(ingressConfig.hosts && {
                            rules: ingressConfig.hosts.map((hostConfig: any) => ({
                                host: hostConfig.host,
                                http: {
                                    paths: hostConfig.paths.map((pathConfig: any) => ({
                                        path: pathConfig.path,
                                        pathType: pathConfig.pathType || "ImplementationSpecific",
                                        backend: {
                                            service: {
                                                name: name,
                                                port: {
                                                    number: serviceConfig.port || 80,
                                                },
                                            },
                                        },
                                    })),
                                },
                            })),
                        }),
                    },
                });

                dcds["ingress"] = Resource.fromJSON({
                    resource: ingress.toJSON(),
                });
            }

            // Update the response with the new desired composed resources
            rsp = setDesiredComposedResources(rsp, dcds);

            const duration = Date.now() - startTime;
            logger?.info(
                { duration: `${duration}ms`, resourceCount: Object.keys(dcds).length },
                "Function completed successfully"
            );

            normal(rsp, `Created ${Object.keys(dcds).length} resource(s) successfully`);
            return rsp;
        } catch (error) {
            const duration = Date.now() - startTime;
            logger?.error(
                {
                    error: error instanceof Error ? error.message : String(error),
                    duration: `${duration}ms`,
                },
                "Function failed"
            );

            fatal(rsp, error instanceof Error ? error.message : String(error));
            return rsp;
        }
    }
}
