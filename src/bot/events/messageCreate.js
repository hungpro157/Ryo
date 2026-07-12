// bot/events/messageCreate.js
import { Events } from 'discord.js';
import { log } from '../../utils/logger.js';
import { config } from '../../config/index.js';
import { rand, sleep } from '../../utils/helpers.js';
import { addMessageToConversation, getMessageCountSinceReflection, getRecentConversation } from '../../ai/memory/conversation.js';
import { triggerReflection } from '../../ai/reflection.js';
import { generateConversationResponse } from '../../conversation/pipeline.js';
import { handleCommand } from '../commands/index.js';
import { classifyError, userErrorMessage } from '../../utils/errors.js';

export function setupMessageCreateEvent(client) {
  client.on(Events.MessageCreate, async (msg) => {
    if (msg.author.bot) return;

    const content = msg.content.trim();
    const lower = content.toLowerCase();
    const isDM = !msg.guild;
    const isMentioned = msg.mentions.has(client.user);
    const hasKeyword = config.discord.triggerWords.some(kw => lower.includes(kw));
    const isCommand = content.startsWith(config.discord.prefix);
    const randomChance = !isCommand && Math.random() < config.discord.respondChance;

    if (isCommand) {
      log.info('CMD', 'Command received', { command: content.slice(config.discord.prefix.length).trim().split(/\s+/u)[0] || 'unknown', guildId: msg.guild?.id || 'DM', userId: msg.author.id, characterCount: content.length });
      try {
        await handleCommand(msg, content.slice(config.discord.prefix.length).trim());
      } catch (error) {
        log.error('CMD', `Command failed: ${error.message}`);
        await msg.reply({ content: `❌ Command failed: ${error.message}`, allowedMentions: { repliedUser: false } });
      }
      return;
    }

    if (!isMentioned && !hasKeyword && !isDM && !randomChance) return;

    // React logic for random triggers
    if (!isMentioned && !hasKeyword && !isDM && Math.random() < config.discord.reactionOnlyRate) {
      try { await msg.react('👀'); } catch {}
      return;
    }

    const guildId = msg.guild?.id || 'DM';
    const channelId = msg.channel.id;
    const userId = msg.author.id;
    const username = msg.member?.displayName ?? msg.author.username;

    log.info('CHAT', 'Message accepted', { guildId, channelId, userId, characterCount: content.length, isDM, isMentioned, hasKeyword });

    addMessageToConversation(guildId, channelId, userId, { role: 'user', username, content });

    const t0 = Date.now();

    try {
      await msg.channel.sendTyping();
      const history = getRecentConversation(guildId, channelId, userId).slice(0, -1);
      
      const result = await generateConversationResponse({
        guildId,
        channelId,
        userId,
        username,
        userMessage: content,
        history
      });

      let reply = result.reply;
      if (result.ragSources?.length) {
        const sourceLines = result.ragSources.map((source) => `- ${source.name} · chunk ${source.chunkIndex + 1}`);
        reply += `\n\n📚 Sources:\n${sourceLines.join('\n')}`;
      }
      
      const ms = Date.now() - t0;
      log.info('CHAT', 'Response ready', { durationMs: ms, responseLength: reply.length, intent: result.intent, tools: result.diagnostics?.selectedTools || [] });

      addMessageToConversation(guildId, channelId, userId, { role: 'assistant', username: 'Ryo', content: reply });

      if (reply.length > 2000) {
        const chunks = reply.match(/.{1,1990}/gs) ?? [reply];
        for (const chunk of chunks) {
          await msg.reply({ content: chunk, allowedMentions: { repliedUser: false } });
          await sleep(500);
        }
      } else {
        await msg.reply({ content: reply, allowedMentions: { repliedUser: false } });
      }

      // Check reflection trigger
      if (getMessageCountSinceReflection(guildId, channelId, userId) >= config.memory.reflectionInterval) {
        enqueueReflection(guildId, channelId, userId);
      }

    } catch (err) {
      const error = classifyError(err);
      log.error('CHAT', 'Response failed', { code: error.code, error: error.message });
      await msg.reply({ content: userErrorMessage(error), allowedMentions: { repliedUser: false } });
    }
  });
}

function enqueueReflection(guildId, channelId, userId) {
  import('../../services/tasks.js').then(({ enqueueTask }) => {
    enqueueTask(async () => {
      await triggerReflection(guildId, channelId, userId);
    });
  }).catch(err => console.error(err));
}
