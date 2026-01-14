#!/usr/bin/env node

import { Command, type OptionValues } from 'commander';
import {
  newGrpcServer,
  startServer,
  FunctionRunner,
  type ServerOptions,
} from '@crossplane-org/function-sdk-typescript';
import { pino } from 'pino';
import { Function } from './function.js';

// defaultAddress where the function will listen for gRPC connections
const defaultAddress = '0.0.0.0:9443';
// defaultTlsServerCertsDir is the directory where the XP package reconciler stores generated TLS certs
const defaultTlsServerCertsDir = '/tls/server';

const program = new Command('configuration-aws-network')
  .option('--address <address>', 'Address at which to listen for gRPC connections', defaultAddress)
  .option('-d, --debug', 'Emit debug logs.', false)
  .option('--insecure', 'Run without mTLS credentials.', false)
  .option(
    '--tls-server-certs-dir <directory>',
    'Serve using mTLS certificates in this directory. The directory should contain tls.key, tls.crt, and ca.crt files.',
    defaultTlsServerCertsDir
  );

// Don't parse yet - parse in main() when we're ready to use the args

function parseArgs(args: OptionValues): ServerOptions {
  return {
    address: typeof args.address === 'string' ? args.address : defaultAddress,
    debug: Boolean(args.debug),
    insecure: Boolean(args.insecure),
    tlsServerCertsDir: typeof args.tlsServerCertsDir === 'string' ? args.tlsServerCertsDir : defaultTlsServerCertsDir,
  };
}

function main() {
  program.parse(process.argv);
  const args = program.opts();
  const opts = parseArgs(args);

  const logger = pino({
    level: opts?.debug ? 'debug' : 'info',
    formatters: {
      level: (label: string) => {
        return { severity: label.toUpperCase() };
      },
    },
  });
  logger.debug({ 'options passed to function': opts });
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
    process.exit(-1);
  }
}

main();
