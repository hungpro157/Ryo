// src/index.js
import { Client, GatewayIntentBits, Partials } from 'discord.js';
import { config } from './config/index.js';
import { log } from './utils/logger.js';
import { initDB, closeDB } from './database/lancedb/index.js';
import { setupReadyEvent } from './bot/events/ready.js';
import { setupMessageCreateEvent } from './bot/events/messageCreate.js';
import { initMemoryDB, closeMemoryDB } from './database/sqlite/memory.js';

// Catch errors gracefully
process.on('uncaughtException', (err) => {
  log.error('APP', `Uncaught Exception: ${err.stack}`);
});
process.on('unhandledRejection', (reason) => {
  log.error('APP', `Unhandled Rejection: ${reason}`);
});

async function bootstrap() {
  log.info('APP', 'Starting Ryo Local AI Bot...');

  try {
    initMemoryDB();
  } catch (err) {
    log.error('APP', `Failed to initialize SQLite memory: ${err.message}`);
    process.exit(1);
  }
  
  // Initialize Database
  try {
    await initDB();
    log.info('APP', 'LanceDB initialized successfully.');
  } catch (err) {
    log.error('APP', `Failed to initialize LanceDB: ${err.message}`);
    process.exit(1);
  }

  // Initialize Discord Client
  const client = new Client({
    intents: [
      GatewayIntentBits.Guilds,
      GatewayIntentBits.GuildMessages,
      GatewayIntentBits.MessageContent,
      GatewayIntentBits.DirectMessages,
    ],
    partials: [Partials.Channel]
  });

  // Setup events
  setupReadyEvent(client);
  setupMessageCreateEvent(client);

  if (!config.discord.token) {
    log.error('APP', 'DISCORD_TOKEN is missing in .env');
    process.exit(1);
  }

  log.info('APP', 'Connecting to Discord...');
  client.login(config.discord.token).catch(err => {
    log.error('APP', `Login failed: ${err.message}`);
    process.exit(1);
  });
}

bootstrap();

async function shutdown(signal) {
  log.info('APP', `Received ${signal}, shutting down...`);
  closeDB();
  closeMemoryDB();
  process.exit(0);
}
process.once('SIGINT', () => shutdown('SIGINT'));
process.once('SIGTERM', () => shutdown('SIGTERM'));
