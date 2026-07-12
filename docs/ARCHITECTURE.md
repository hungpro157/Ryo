# Ryo Architecture

Ryo PC Edition là Discord bot chạy ưu tiên trên Windows, viết bằng Node.js ESM. Mô hình hội thoại chạy cục bộ qua Ollama hoặc llama.cpp; bot không cần cloud LLM API.

## Luồng xử lý tin nhắn

```text
Discord message
  -> mention/DM/command routing
  -> message analyzer
  -> intent classifier
  -> planner (nếu bật)
  -> plan validator
  -> controlled tool executor
  -> request-scoped evidence store
  -> result combiner
  -> dynamic prompt builder
  -> local LLM
  -> response validator
  -> Discord reply
```

Planner không tạo câu trả lời cuối. Nó chỉ chọn tool, thứ tự thực thi và loại evidence cần thu thập. Prompt builder và local LLM vẫn tạo nội dung gửi lên Discord.

## Các khối chính

- `src/bot`: command và Discord event handlers.
- `src/conversation`: phân tích message, intent, routing, execution context và response validation.
- `src/planner`: deterministic/LLM planning, validation, execution và evidence combination.
- `src/tools`: các tool runtime, hiện tập trung vào YouTube.
- `src/ai`: local LLM, prompt, memory facade và retrieval.
- `src/database`: SQLite conversation memory và LanceDB knowledge storage.
- `src/config`: cấu hình tập trung từ environment variables.

## Ranh giới an toàn

- Plan chỉ được gọi tool đã đăng ký; không chạy JavaScript, shell, file path hay URL tùy ý.
- Tool evidence được giữ tách theo nguồn.
- Conversation memory được cô lập bằng `guildId`, `channelId`, `userId`.
- General knowledge dùng `guildId`; private user knowledge dùng `guildId` và `userId`.
- Khi planner bị tắt hoặc lỗi, legacy YouTube routing vẫn hoạt động.
- Token, API key, `.env`, raw transcript, raw comment dump và private memory không được log.

## Kiểm tra

Chạy toàn bộ kiểm tra bằng:

```powershell
npm test
npm run check
```
