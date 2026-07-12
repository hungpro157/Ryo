// utils/chunker.js
import { config } from '../config/index.js';

export function chunkText(text) {
  // Approximate tokens by characters (1 token ~= 4 chars)
  const chunkSize = config.rag.chunkSize * 4;
  const chunkOverlap = config.rag.chunkOverlap * 4;
  
  if (text.length <= chunkSize) {
    return [text];
  }
  
  const chunks = [];
  let i = 0;
  while (i < text.length) {
    const end = Math.min(i + chunkSize, text.length);
    let chunk = text.slice(i, end);
    
    // Adjust end to avoid splitting words if possible
    if (end < text.length && !chunk.endsWith(' ')) {
      const lastSpace = chunk.lastIndexOf(' ');
      if (lastSpace > 0 && lastSpace > chunkSize / 2) {
        chunk = chunk.slice(0, lastSpace);
      }
    }
    
    chunks.push(chunk.trim());
    i += chunk.length - chunkOverlap;
  }
  
  return chunks;
}
