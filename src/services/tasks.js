// services/tasks.js
import { log } from '../utils/logger.js';

const taskQueue = [];
let isProcessing = false;

export function enqueueTask(taskFn) {
  taskQueue.push(taskFn);
  if (!isProcessing) {
    processQueue();
  }
}

async function processQueue() {
  isProcessing = true;
  while (taskQueue.length > 0) {
    const task = taskQueue.shift();
    try {
      await task();
    } catch (err) {
      log.error('TASK', `Background task failed: ${err.message}`);
    }
  }
  isProcessing = false;
}
