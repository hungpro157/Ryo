// bot/events/ready.js
import { Events, ActivityType } from 'discord.js';
import { log } from '../../utils/logger.js';
import { config } from '../../config/index.js';

export function setupReadyEvent(client) {
  client.once(Events.ClientReady, async () => {
    log.info('BOT', `RYO IS ONLINE (Local AI v5)`);
    log.info('BOT', `Tag      : ${client.user.tag}`);
    log.info('BOT', `Servers  : ${client.guilds.cache.size}`);
    log.info('BOT', `LLM      : ${config.llm.model} (${config.llm.provider})`);
    log.info('BOT', `Embed    : ${config.embedding.model} (${config.embedding.provider})`);
    log.info('BOT', `YouTube  : ${config.youtube.commentsEnabled && config.youtube.apiKey ? 'ready' : 'disabled'}`);
    
    client.user.setActivity("everyone 👀 | !ryo help", { type: ActivityType.Watching });
    
    // Background tasks can be initialized here
    log.info('BOT', `✅ Initialization complete.`);
  });
}
