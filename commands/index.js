// commands/index.js — Router điều phối lệnh

import { handleRyoSub } from "./ryo.js";
import { handleTldr } from "./tldr.js";
import { handleTranslate } from "./translate.js";
import { handleImagine } from "./imagine.js";
import { handlePoll } from "./poll.js";
import { handle8ball } from "./eightball.js";

/**
 * Route commands tới handler tương ứng
 * @param {import("discord.js").Message} msg
 * @param {string} args
 * @param {{ memory: any, ai: any }} context
 */
export async function handleCommand(msg, args, context) {
  const [cmd, ...rest] = args.split(/\s+/);
  const sub  = cmd.toLowerCase();
  const body = rest.join(" ").trim();

  switch (sub) {
    case "ryo":       return handleRyoSub(msg, body, context);
    case "tldr":      return handleTldr(msg, body, context);
    case "translate":
    case "dich":      return handleTranslate(msg, body, context);
    case "imagine":
    case "vẽ":
    case "ve":        return handleImagine(msg, body, context);
    case "poll":      return handlePoll(msg, body, context);
    case "8ball":     return handle8ball(msg, body, context);
    default:          return; // không phải lệnh biết tới, bỏ qua
  }
}
