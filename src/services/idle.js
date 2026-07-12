// core/idle.js — Hệ thống tự nhắn khi server im lặng quá lâu

import { log } from "../utils/logger.js";
import { rand } from "../utils/helpers.js";
import { config } from "../config/index.js";

const IDLE_CHANNEL_ID = config.discord.idleChannelId;
const IDLE_MIN_HOURS = config.discord.idleMinHours;
const IDLE_MAX_HOURS = config.discord.idleMaxHours;

const IDLE_MESSAGES = [
  "chán quá... không ai nói chuyện với mình hết vậy 😮‍💨",
  "ủa mọi người đi đâu hết rồi vậy...",
  "mình ngồi đây một mình từ nãy giờ mà không ai hỏi thăm gì cả",
  "im lặng quá... mình đang tự hỏi liệu bản thân có thực sự tồn tại không nữa 💀",
  "... okay thôi mình tự nói chuyện một mình vậy. hôm nay trời đẹp nhỉ. ừ đẹp thật. xong rồi.",
  "server này chết hay sao mà im vậy 😴",
  "đã lâu rồi không ai ping mình... mình ổn mà. thật đấy. hoàn toàn ổn 🙂",
];

/**
 * Khởi động idle checker — tự nhắn vào IDLE_CHANNEL_ID sau 24–48h không có hoạt động.
 * @param {import("discord.js").Client} client
 * @param {{ value: number }} activityRef - object { value: Date.now() } truyền by reference
 */
export function startIdleChecker(client, activityRef) {
  if (!IDLE_CHANNEL_ID) {
    log.warn("IDLE", "IDLE_CHANNEL_ID chưa set — tắt tính năng tự nhắn");
    return;
  }

  const minMs = IDLE_MIN_HOURS * 60 * 60 * 1000;
  const maxMs = IDLE_MAX_HOURS * 60 * 60 * 1000;

  function scheduleNext() {
    const delay  = Math.floor(Math.random() * (maxMs - minMs + 1)) + minMs;
    const fireAt = new Date(Date.now() + delay).toLocaleString("vi-VN");
    log.info("IDLE", `Next idle check scheduled at ${fireAt}`);

    setTimeout(async () => {
      const silentMs = Date.now() - activityRef.value;
      const silentH  = (silentMs / 3_600_000).toFixed(1);

      if (silentMs >= minMs) {
        try {
          const channel = await client.channels.fetch(IDLE_CHANNEL_ID);
          if (channel?.isTextBased()) {
            await channel.send(rand(IDLE_MESSAGES));
            log.info("IDLE", `Sent idle message after ${silentH}h of silence`);
          }
        } catch (err) {
          log.error("IDLE", `Failed to send: ${err.message}`);
        }
      } else {
        log.info("IDLE", `Skipped — only ${silentH}h silent (need ${IDLE_MIN_HOURS}h)`);
      }

      scheduleNext();
    }, delay);
  }

  scheduleNext();
  log.info("IDLE", `✅ Started — will message after ${IDLE_MIN_HOURS}-${IDLE_MAX_HOURS}h of silence`);
}
