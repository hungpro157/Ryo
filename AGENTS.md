# Ryo repository instructions

- This is a Windows-first Discord AI bot written in Node.js ESM.
- Preserve mention/DM behavior and existing commands.
- Local inference is provided through Ollama or llama.cpp. Do not add cloud APIs unless explicitly requested.
- RAG uses LanceDB and the vector field must always be named `vector`.
- Metadata field casing is exact: `guildId`, `channelId`, `userId`.
- General uploaded knowledge is scoped by `guildId`; private user memories are scoped by both `guildId` and `userId`.
- Never commit or print `.env`, Discord tokens, API keys, or private memory contents.
- Keep changes focused. Run `npm run check` after edits.
- Do not delete the database automatically. Use `npm run db:reset -- --force` only when explicitly requested.
