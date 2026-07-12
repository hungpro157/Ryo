# Ryo PC Edition

Bản Windows/PC của Ryo Discord AI bot. Chat chạy local qua Ollama hoặc llama.cpp; RAG dùng LanceDB và embedding local.

## Yêu cầu

- Windows 10/11 64-bit
- Node.js 22 LTS
- Ollama for Windows
- RAM khuyến nghị: 16 GB cho Qwen3 4B; 24 GB trở lên nếu đổi sang 8B

## Cài nhanh

1. Giải nén project vào thư mục không có ký tự lạ.
2. Chạy `setup.bat`.
3. Mở `.env`, điền `DISCORD_TOKEN`.
4. Chạy `start.bat`.

Hoặc PowerShell:

```powershell
npm.cmd install
Copy-Item .env.example .env
notepad .env
ollama pull qwen3:4b-instruct
ollama pull qwen3-embedding:0.6b
npm.cmd start
```

## Cấu hình mặc định

```env
AI_PROVIDER=ollama
LLM_MODEL=qwen3:4b-instruct
OLLAMA_BASE_URL=http://127.0.0.1:11434

EMBEDDING_PROVIDER=ollama
EMBEDDING_MODEL=qwen3-embedding:0.6b
EMBEDDING_DIMENSIONS=1024

RAG_MODE=hybrid
RAG_TOP_K=4
LLM_CONTEXT_LIMIT=4096
```

Muốn dùng Qwen 8B:

```powershell
ollama pull qwen3:8b
```

rồi đổi trong `.env`:

```env
LLM_MODEL=qwen3:8b
```

## Lệnh Discord

- `!health`
- `!knowledge stats`
- `!knowledge search <câu hỏi>`
- `!knowledge add` kèm file `.txt`, `.md`, `.json` hoặc `.csv`
- `!ryo`
- `!tldr`
- `!translate`
- `!8ball`
- `!poll`

Bot mặc định chỉ trả lời khi bị mention, trong DM, hoặc khi nội dung chứa từ khóa gọi Ryo.

## YouTube comments tool

Tạo API key trong Google Cloud Console, bật **YouTube Data API v3**, rồi thêm vào `.env`:

```env
YOUTUBE_API_KEY=your_api_key_here
YOUTUBE_API_TIMEOUT=15000
YOUTUBE_MAX_COMMENTS=20
YOUTUBE_MAX_COMMENTS_LIMIT=50
YOUTUBE_LANGUAGE=vi
```

Không commit API key. Bot dùng API chính thức để lấy metadata, top-level comments và replies
khi được yêu cầu. Mặc định chỉ lấy 20 comment, không tải hàng nghìn comment tự động.

Ví dụ trong Discord:

```text
@Ryo lấy bình luận video này https://www.youtube.com/watch?v=VIDEO_ID
@Ryo comment video này nói gì? https://youtu.be/VIDEO_ID
@Ryo mọi người phản ứng sao, lấy cả replies https://youtube.com/shorts/VIDEO_ID
@Ryo video này bị chê gì? https://www.youtube.com/watch?v=VIDEO_ID
```

Comment chỉ được xem là ý kiến của người dùng YouTube, không phải bằng chứng xác thực. Bot
không được bịa thêm comment hoặc tuyên bố tỷ lệ phần trăm khi chưa thực sự tính toán.

### Lọc và chọn comment liên quan

Trước khi gửi dữ liệu cho Ollama, bot chuẩn hóa Unicode/HTML, loại noise và promotion, gộp
comment trùng, chấm quality/relevance, phân loại sentiment, gom topic và chọn quote đại diện.
Ollama chỉ nhận structured evidence đã giới hạn, không nhận toàn bộ raw comment.

```env
YOUTUBE_COMMENT_FETCH_LIMIT=100
YOUTUBE_COMMENT_PROCESS_LIMIT=300
YOUTUBE_COMMENT_LLM_LIMIT=30
YOUTUBE_COMMENT_TOPIC_LIMIT=8
YOUTUBE_COMMENT_QUOTES_PER_TOPIC=3
YOUTUBE_COMMENT_SIMILARITY_THRESHOLD=0.84
YOUTUBE_COMMENT_MIN_QUALITY=0.2
YOUTUBE_COMMENT_MIN_RELEVANCE=0.12
```

Các mode được suy ra tự động từ câu hỏi: `overall_reaction`, `praise`, `criticism`,
`problems`, `questions`, `disagreement`, `useful_quotes`, `funny_comments`,
`topic_search` và `representative_sample`. Ví dụ:

```text
@Ryo lấy mấy comment đáng chú ý của video này <URL>
@Ryo mọi người chê gì? <URL>
@Ryo comment nào nói về âm thanh? <URL>
@Ryo có ai báo lỗi không? <URL>
@Ryo lấy vài câu hài nhất <URL>
@Ryo lọc bỏ comment rác rồi tóm tắt <URL>
@Ryo lấy 10 câu liên quan đến pin <URL>
```

## Conversation pipeline

Tin nhắn chat thông thường đi qua pipeline rule-based trước khi gọi model:

1. Phân tích độ dài, emoji, câu hỏi và username/ping.
2. Phân loại intent như greeting, ping, reaction, technical question hoặc roleplay.
3. Chọn 2–4 few-shot phù hợp thay vì nhét toàn bộ ví dụ vào prompt.
4. Chọn giới hạn token và temperature theo loại input.
5. Kiểm tra câu trả lời để chặn suy diễn không có context và roleplay ngoài yêu cầu.
6. Sinh lại tối đa một lần nếu vi phạm rule quan trọng.

Ví dụ `Ryo`, `ê`, `👀` hoặc một username đứng riêng sẽ được xem như lời gọi ngắn, không
được dùng làm lý do để tự bịa tiểu sử. Cấu hình mặc định:

```env
CONVERSATION_FEW_SHOT_MIN=2
CONVERSATION_FEW_SHOT_MAX=4
CONVERSATION_VALIDATION_RETRIES=1
CONVERSATION_SHORT_MAX_TOKENS=24
CONVERSATION_SHORT_TEMPERATURE=0.55
CONVERSATION_NORMAL_MAX_TOKENS=140
CONVERSATION_NORMAL_TEMPERATURE=0.65
CONVERSATION_TECHNICAL_MAX_TOKENS=400
CONVERSATION_TECHNICAL_TEMPERATURE=0.45
```

## Trí nhớ SQLite

Hội thoại được lưu cục bộ trong SQLite và tách biệt theo `guildId`, `channelId` và `userId`.
Prompt chỉ nhận các tin nhắn gần nhất; phần hội thoại cũ được tóm tắt nền sau khi đạt
`REFLECTION_INTERVAL`. LanceDB vẫn chỉ phục vụ knowledge/RAG như trước.

```env
MEMORY_DB_PATH=./data/memory.sqlite
MEMORY_DB_MAX_MB=64
CONVERSATION_HISTORY_LIMIT=10
REFLECTION_INTERVAL=50
MEMORY_SUMMARY_MAX_TOKENS=300
```

Khi file SQLite vượt `MEMORY_DB_MAX_MB`, các message cũ được prune theo đợt. Bot không tự
xóa toàn bộ database. Các lệnh quản lý:

- `!memory show`: xem tóm tắt của chính bạn trong channel hiện tại.
- `!memory stats`: xem số lượng record và dung lượng.
- `!memory clear me`: xóa trí nhớ của bạn trong server hiện tại.
- `!memory clear channel`: xóa trí nhớ channel; yêu cầu quyền Manage Messages.
- `!memory clear guild`: xóa trí nhớ server; yêu cầu quyền Manage Server.

## Kiểm tra RAG

Tạo `rag-test.txt`:

```text
Mã kiểm thử RAG là RYO-9274.
Tên bot là Ryo.
Model chính là Qwen3 4B.
```

Gửi file trong Discord cùng lệnh:

```text
!knowledge add
```

Sau đó:

```text
!knowledge stats
!knowledge search RYO-9274
```

## Khi đổi embedding model

Vector cũ không tương thích với model embedding mới. Reset database rồi index lại tài liệu:

```powershell
npm.cmd run db:reset -- --force
```

## Sửa lỗi thường gặp

### `ollama` không được nhận diện

Cài Ollama, đóng rồi mở lại PowerShell. Kiểm tra:

```powershell
ollama --version
ollama list
```

### `npm.ps1 cannot be loaded`

Dùng:

```powershell
npm.cmd install
npm.cmd start
```

### `DISCORD_TOKEN is missing`

Đảm bảo file thật là `.env`, không phải `.env.txt`, và bot được chạy từ thư mục chứa `package.json`.

### LanceDB schema không khớp

```powershell
npm.cmd run db:reset -- --force
```

## Stabilization checks

```powershell
npm.cmd test
npm.cmd run test:behavior
npm.cmd run test:integration
npm.cmd run check
npm.cmd run check:imports
npm.cmd run validate:config
```

Pipeline ghi timing cho analyze, intent, tool, prompt, generation, validation và total. Log chỉ
chứa metadata như intent, tool đã chọn, độ dài và thời gian; raw chat, transcript, comment,
token và API key không được ghi. Các request YouTube comments giống nhau đang chạy đồng thời
được gộp bằng single-flight và kết quả xử lý có LRU cache 15 phút.

`YOUTUBE_COMMENTS_ENABLED=false` tắt riêng YouTube comments mà không ảnh hưởng chat/Ollama.
Transcript retrieval chưa có trong commit hiện tại; các test transcript chỉ nên được thêm sau
khi Phase 3 được triển khai và commit riêng.

## Phát triển bằng Codex

Project có `AGENTS.md`. Trước khi cho Codex sửa:

```powershell
git init
git add .
git commit -m "working baseline"
```

Sau khi sửa:

```powershell
npm.cmd run check
git diff
```

Không đưa `.env` hoặc token vào prompt, Git hay file nén chia sẻ.
