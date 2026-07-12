// core/permissions.js — Tự nhận biết owner/admin/mod từ Discord API
// KHÔNG cần config tay, tự đúng ở mọi server bot được add vào.

import { PermissionFlagsBits } from "discord.js";
import { config } from "../config/index.js";

/**
 * Có phải owner của server này không
 * (hoặc owner cá nhân của bot, khi chat qua DM)
 */
export function detectIsOwner(msg) {
  if (msg.guild) return msg.guild.ownerId === msg.author.id;
  return Boolean(config.discord.ownerId) && String(msg.author.id) === config.discord.ownerId; // DM: dùng fallback
}

/**
 * Trả về "admin" | "mod" | null dựa theo quyền thật trong server
 * — không tính owner (đã tách riêng)
 */
export function detectMemberRole(msg) {
  if (!msg.guild || !msg.member) return null;
  const perms = msg.member.permissions;
  if (perms.has(PermissionFlagsBits.Administrator)) return "admin";
  if (perms.has(PermissionFlagsBits.ManageGuild) || perms.has(PermissionFlagsBits.ManageMessages)) return "mod";
  return null;
}

/**
 * Lấy danh sách custom emoji của server, định dạng sẵn để AI dùng được luôn.
 * Discord cần đúng cú pháp <:tên:id> (hoặc <a:tên:id> nếu animated) để hiển thị,
 * nên phải đưa sẵn cho AI dạng "ready-to-paste".
 */
export function getServerEmojis(guild, limit = 25) {
  if (!guild) return [];
  return [...guild.emojis.cache.values()]
    .slice(0, limit)
    .map(e => ({
      name: e.name,
      tag: e.animated ? `<a:${e.name}:${e.id}>` : `<:${e.name}:${e.id}>`
    }));
}
