import {
    Resource,
    RunFunctionRequest,
    RunFunctionResponse,
    fatal,
    normal,
    setDesiredComposedResources,
    to,
    getDesiredComposedResources,
    getDesiredCompositeResource,
    getObservedCompositeResource,
    type FunctionHandler,
    type Logger,
} from "function-sdk-typescript";
import { Pod } from "kubernetes-models/v1";

/**
 * Function is a sample implementation showing how to use the SDK
 * This creates a Deployment and Pod as example resources
 */
export class Function implements FunctionHandler {
    async RunFunction(
        req: RunFunctionRequest,
        logger?: Logger,
    ): Promise<RunFunctionResponse> {
        const startTime = Date.now();

        // Set up a minimal response from the request
        let rsp = to(req);

        try {
            // Get our Observed Composite
            const oxr = getObservedCompositeResource(req);
            logger?.debug({ oxr }, "Observed composite resource");

            // Get our Desired Composite
            const dxr = getDesiredCompositeResource(req);
            logger?.debug({ dxr }, "Desired composite resource");

            // List the Desired Composed resources
            let dcds = getDesiredComposedResources(req);

            // Create resource from a JSON object
            dcds["deployment"] = Resource.fromJSON({
                resource: {
                    apiVersion: "apps/v1",
                    kind: "Deployment",
                    metadata: {
                        name: "my-deployment",
                        namespace: "foo",
                    },
                    spec: {
                        replicas: 3,
                        selector: {
                            matchLabels: {
                                app: "my-app",
                            },
                        },
                        template: {
                            metadata: {
                                labels: {
                                    app: "my-app",
                                },
                            },
                            spec: {
                                containers: [
                                    {
                                        name: "my-container",
                                        image: "my-image:latest",
                                        ports: [
                                            {
                                                containerPort: 80,
                                            },
                                        ],
                                    },
                                ],
                            },
                        },
                    },
                },
            });

            // Create a resource from a Model at https://github.com/tommy351/kubernetes-models-ts
            const pod = new Pod({
                metadata: {
                    name: "pod",
                    namespace: "default",
                },
                spec: {
                    containers: [],
                },
            });

            pod.validate();

            dcds["pod"] = Resource.fromJSON({ resource: pod.toJSON() });

            // Merge dcds with existing resources using the response helper
            rsp = setDesiredComposedResources(rsp, dcds);

            const duration = Date.now() - startTime;
            logger?.info({ duration: `${duration}ms` }, "Function completed successfully");

            normal(rsp, "processing complete");
            return rsp;
        } catch (error) {
            const duration = Date.now() - startTime;
            logger?.error({
                error: error instanceof Error ? error.message : String(error),
                duration: `${duration}ms`,
            }, "Function invocation failed");

            fatal(rsp, error instanceof Error ? error.message : String(error));
            return rsp;
        }
    }
}
