import { EmbedBuilder } from 'discord.js';
import { addMessageToConversation, getRecentConversation } from '../../ai/memory/conversation.js';
import { generateConversationResponse } from '../../conversation/pipeline.js';

async function sendHelp(msg) {
  const embed = new EmbedBuilder()
    .setTitle('🌸 Ryo — Local AI Discord Bot')
    .setDescription("Mention Ryo, nhắn DM hoặc dùng `!ryo <tin nhắn>` để chat.")
    .setColor(0xFF6B9D)
    .addFields(
      { name: '🧠 Memory', value: '`!ryo memory` · `!ryo digest` · `!ryo forget me` · `!ryo stats`' },
      { name: '🛠️ Tiện ích', value: '`!tldr` · `!translate` · `!poll` · `!8ball` · `!knowledge` · `!health`' },
    )
    .setFooter({ text: 'Ryo PC Edition · Ollama · SQLite · LanceDB' });
  await msg.reply({ embeds: [embed], allowedMentions: { repliedUser: false } });
}

export async function handleRyoSub(msg, body) {
  if (!body || body.toLowerCase() === 'help') return sendHelp(msg);
  const guildId = msg.guild?.id || 'DM';
  const channelId = msg.channel.id;
  const userId = msg.author.id;
  const username = msg.member?.displayName ?? msg.author.username;
  addMessageToConversation(guildId, channelId, userId, { role: 'user', username, content: body });
  const history = getRecentConversation(guildId, channelId, userId).slice(0, -1);
  await msg.channel.sendTyping();
  const result = await generateConversationResponse({ guildId, channelId, userId, username, userMessage: body, history });
  addMessageToConversation(guildId, channelId, userId, { role: 'assistant', username: 'Ryo', content: result.reply });
  await msg.reply({ content: result.reply, allowedMentions: { repliedUser: false } });
}
