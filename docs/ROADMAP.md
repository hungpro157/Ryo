# Roadmap

Tài liệu này mô tả hướng phát triển dự kiến, không phải cam kết rằng tính năng đã tồn tại.

## Hoàn thành

- Discord mention/DM và command routing.
- Local Ollama/llama.cpp conversation pipeline.
- Intent analysis, dynamic prompting, few-shot selection và response validation.
- SQLite scoped conversation memory.
- YouTube metadata và bounded comment intelligence.
- Phase 4 deterministic planner, strict validation và controlled execution.
- Dependency ordering, safe parallel steps, timeout, deduplication và partial evidence.
- Behavior, integration và planner unit tests dùng mocks.

## Việc gần nhất

- Kết nối production transcript retrieval/search adapter nếu implementation hợp lệ được thêm vào repository.
- Bổ sung dedicated recent-video store và ordinal reference resolution với scope `guildId/channelId/userId`.
- Mở rộng integration tests cho transcript sau khi production adapter tồn tại.
- Hoàn thiện LLM planner evaluation trước khi cân nhắc bật mặc định.
- Bổ sung cache metrics và cancellation propagation test ở cấp pipeline.

## Ngoài Phase 4

Các hạng mục sau không thuộc planner phase hiện tại và không nên được ghép vào mà thiếu thiết kế/ủy quyền riêng:

- general web search hoặc browser automation;
- MCP;
- voice;
- autonomous background tasks;
- general multi-agent orchestration;
- thay đổi embeddings/RAG không liên quan planner.

Mọi thay đổi tương lai phải giữ backward compatibility, local-inference-first, memory isolation và quy tắc LanceDB field `vector`.
