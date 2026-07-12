import { handleRyoSub } from './ryo.js';
import { handleTldr } from './tldr.js';
import { handleTranslate } from './translate.js';
import { handlePoll } from './poll.js';
import { handle8ball } from './eightball.js';
import { handleHealth } from './health.js';
import { handleKnowledge } from './knowledge.js';
import { handleMemory } from './memory.js';

export async function handleCommand(msg, args, context) {
  const [cmd = '', ...rest] = args.split(/\s+/);
  const sub = cmd.toLowerCase();
  const body = rest.join(' ').trim();

  switch (sub) {
    case 'ryo': {
      const memoryActions = ['memory', 'digest', 'forget', 'forget me', 'stats'];
      if (memoryActions.includes(body.toLowerCase())) {
        const mapped = body.toLowerCase() === 'memory' ? 'show' : body;
        return handleMemory(msg, mapped);
      }
      return handleRyoSub(msg, body, context);
    }
    case 'tldr': return handleTldr(msg, body, context);
    case 'translate':
    case 'dich': return handleTranslate(msg, body, context);
    case 'poll': return handlePoll(msg, body, context);
    case '8ball': return handle8ball(msg, body, context);
    case 'health': return handleHealth(msg);
    case 'knowledge': return handleKnowledge(msg, body);
    case 'memory': return handleMemory(msg, body);
    default: return undefined;
  }
}
