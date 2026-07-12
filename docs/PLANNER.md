# Planner

Planner Phase 4 cung cấp controlled multi-tool execution cho các yêu cầu YouTube. Nó không phải autonomous agent và không được tự mở rộng phạm vi công việc.

## Chiến lược hybrid

Deterministic planner xử lý các pattern quen thuộc như:

- tóm tắt video;
- phân tích lời khen/chê trong comment;
- tìm chủ đề và timestamp trong transcript;
- tóm tắt một khoảng thời gian;
- so sánh nội dung người nói với phản ứng người xem.

Simple chat và câu hỏi kỹ thuật thông thường tạo plan rỗng. Optional LLM planner chỉ dành cho yêu cầu YouTube compound chưa được deterministic rules giải quyết. Nó dùng prompt riêng, JSON-only, nhiệt độ thấp và bị tắt mặc định.

## Plan schema

```json
{
  "version": 1,
  "requestType": "youtube_comment_analysis",
  "requiresClarification": false,
  "clarificationQuestion": null,
  "steps": [
    {
      "id": "comments",
      "tool": "youtube.comments",
      "action": "analyze",
      "dependsOn": [],
      "canRunInParallel": true,
      "input": { "videoUrl": "https://youtu.be/...", "mode": "criticism" },
      "expectedOutput": "comment_evidence",
      "required": true
    }
  ],
  "responseMode": "youtube_comment_analysis",
  "limitations": []
}
```

## Validation và execution

Validator từ chối unknown tool/action, input không an toàn, step ID trùng, dependency sai hoặc vòng, duplicate calls, plan quá sâu, quá nhiều step và vượt expensive-tool budget.

Executor chạy các dependency layer theo thứ tự và chạy những sibling step an toàn bằng `Promise.all`. Mỗi step có timeout/retry riêng. Step thành công không bị gọi lại khi step khác lỗi; dependent step sẽ bị skip nếu dependency thất bại.

Evidence được lưu theo request trong các nhóm `metadata`, `transcript`, `comments`, `memory`. Result combiner giới hạn kích thước prompt và không trộn viewer reaction thành fact của video.

## Cấu hình

```dotenv
PLANNER_ENABLED=true
PLANNER_LLM_ENABLED=false
PLANNER_MAX_STEPS=6
PLANNER_MAX_EXPENSIVE_STEPS=2
PLANNER_TIMEOUT_MS=10000
PLANNER_TOTAL_TOOL_TIMEOUT_MS=120000
```

Khi `PLANNER_ENABLED=false`, pipeline dùng legacy routing. Invalid LLM JSON hoặc validation failure cũng quay về deterministic/legacy fallback.

## Giới hạn hiện tại

Repository hiện chưa có production transcript service. `youtube.transcript` chỉ được đăng ký khi caller cung cấp một transcript adapter thật; planner không giả lập dữ liệu transcript.
