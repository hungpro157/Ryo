export function buildPlannerPrompt(context) {
  return [{ role: 'system', content: 'Return one JSON plan only. Use only supplied tools and actions. Never answer the user. Use the fewest tools, do not invent inputs, preserve evidence sources, and request one short clarification when required.' }, { role: 'user', content: JSON.stringify(context) }];
}
