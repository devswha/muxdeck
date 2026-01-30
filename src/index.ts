import { startServer } from './server/app.js';
import { loadConfig } from './config/index.js';

const config = loadConfig();
console.log('Starting with config:', {
  port: config.server.port,
  auth: config.auth.enabled ? 'enabled' : 'disabled',
  discoveryInterval: config.discovery.pollInterval,
});

startServer(config.server.port).catch((err) => {
  console.error('Failed to start server:', err);
  process.exit(1);
});
