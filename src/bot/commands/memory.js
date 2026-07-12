import { PermissionFlagsBits } from 'discord.js';
import {
  clearChannelMemory,
  clearGuildMemory,
  clearUserMemory,
  getMemoryStats,
  getSummary,
} from '../../database/sqlite/memory.js';
import { log } from '../../utils/logger.js';

function scopeFor(msg) {
  return {
    guildId: msg.guild?.id || 'DM',
    channelId: msg.channel.id,
    userId: msg.author.id,
  };
}

function canManageChannel(msg) {
  if (!msg.guild) return true;
  return msg.member?.permissions.has(PermissionFlagsBits.ManageMessages)
    || msg.member?.permissions.has(PermissionFlagsBits.ManageGuild)
    || msg.member?.permissions.has(PermissionFlagsBits.Administrator);
}

function canManageGuild(msg) {
  return Boolean(msg.guild) && (
    msg.guild.ownerId === msg.author.id
    || msg.member?.permissions.has(PermissionFlagsBits.Administrator)
    || msg.member?.permissions.has(PermissionFlagsBits.ManageGuild)
  );
}

async function reply(msg, content) {
  await msg.reply({ content, allowedMentions: { repliedUser: false } });
}

export async function handleMemory(msg, body = '') {
  const scope = scopeFor(msg);
  const action = body.trim().toLowerCase();

  if (!action || action === 'show' || action === 'digest') {
    const summary = getSummary(scope.guildId, scope.channelId, scope.userId);
    return reply(msg, summary
      ? `🧠 **Tóm tắt trí nhớ của bạn trong channel này**\n${summary}`
      : '🧠 Chưa có hội thoại cũ nào được tóm tắt cho bạn trong channel này.');
  }

  if (action === 'stats') {
    const stats = getMemoryStats(scope.guildId);
    return reply(msg, [
      '📊 **SQLite Memory**',
      `Messages: \`${stats.messages}\``,
      `Summaries: \`${stats.summaries}\``,
      `Users: \`${stats.users}\``,
      `Channels: \`${stats.channels}\``,
      `Database: \`${(stats.sizeBytes / 1024 / 1024).toFixed(2)} / ${(stats.maxBytes / 1024 / 1024).toFixed(0)} MB\``,
    ].join('\n'));
  }

  if (['clear me', 'forget me', 'clear user'].includes(action)) {
    clearUserMemory(scope.guildId, scope.userId);
    log.warn('MEMORY', `User memory cleared in guild=${scope.guildId}, user=${scope.userId}`);
    return reply(msg, '🗑️ Đã xóa trí nhớ của bạn trong server này.');
  }

  if (['clear channel', 'forget', 'forget channel'].includes(action)) {
    if (!canManageChannel(msg)) return reply(msg, '❌ Bạn cần quyền Manage Messages để xóa trí nhớ của channel.');
    clearChannelMemory(scope.guildId, scope.channelId);
    log.warn('MEMORY', `Channel memory cleared in guild=${scope.guildId}, channel=${scope.channelId}`);
    return reply(msg, '🗑️ Đã xóa toàn bộ trí nhớ của channel này.');
  }

  if (['clear guild', 'clear server', 'forget guild'].includes(action)) {
    if (!canManageGuild(msg)) return reply(msg, '❌ Bạn cần quyền Manage Server để xóa trí nhớ của server.');
    clearGuildMemory(scope.guildId);
    log.warn('MEMORY', `Guild memory cleared in guild=${scope.guildId}`);
    return reply(msg, '🗑️ Đã xóa toàn bộ trí nhớ hội thoại của server này.');
  }

  return reply(msg, [
    '**Memory commands**',
    '`!memory show` — xem tóm tắt của bạn trong channel',
    '`!memory stats` — xem thống kê',
    '`!memory clear me` — xóa trí nhớ của bạn trong server',
    '`!memory clear channel` — xóa channel (cần Manage Messages)',
    '`!memory clear guild` — xóa server (cần Manage Server)',
  ].join('\n'));
}
