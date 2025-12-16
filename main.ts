#!/usr/bin/env node

import { Command } from "commander";
import { newGrpcServer, startServer, FunctionRunner, type ServerOptions } from "function-sdk-typescript";
import { pino } from "pino";
import { Function } from "./function.js";

// Type for commander options
type OptionValues = Record<string, any>;

// defaultAddress where the function will listen for gRPC connections
const defaultAddress = "0.0.0.0:9443";
// defaultTlsServerCertsDir is the directory where the XP package reconciler stores generated TLS certs
const defaultTlsServerCertsDir = "/tls/server"

const logger = pino({
    level: "info",
});

const program = new Command("function-typescript-example")
    .option(
        "--address",
        "Address at which to listen for gRPC connections",
        defaultAddress,
    )
    .option("-d, --debug", "Emit debug logs.", false)
    .option("--insecure", "Run without mTLS credentials.", false)
    .option(
        "--tls-server-certs-dir [Directory]",
        "Serve using mTLS certificates in this directory. The directory should contain tls.key, tls.crt, and ca.crt files.",
        defaultTlsServerCertsDir
    );

program.parse(process.argv);

function parseArgs(args: OptionValues): ServerOptions {
    return {
        address: args?.address || defaultAddress,
        debug: args.debug,
        insecure: args.insecure,
        tlsServerCertsDir: args.tlsServerCertsDir,
    };
}

function main() {
    const args = program.opts();
    const opts = parseArgs(args);

    const logger = pino({
        level: opts?.debug ? "debug" : "info",
        formatters: {
            level: (label: string) => {
                return { severity: label.toUpperCase() };
            },
        },
    });
    logger.debug({ "options passed to function": opts });
    try {
        // Create an instance of your function implementation
        const fn = new Function();

        // Create the function runner with your handler
        const fnRunner = new FunctionRunner(fn, logger);

        // Create and start the gRPC server
        const server = newGrpcServer(fnRunner, logger);
        startServer(server, opts, logger);

        // Keep the process running to handle gRPC requests
        process.on('SIGINT', () => {
            logger.info('shutting down gracefully...');
            server.tryShutdown((err: Error | undefined) => {
                if (err) {
                    logger.error(err, 'error during shutdown');
                    process.exit(1);
                }
                logger.info('server shut down successfully');
                process.exit(0);
            });
        });
    } catch (err) {
        logger.error(err);
        // eslint-disable-next-line no-process-exit
        process.exit(-1);
    }
}

main();
