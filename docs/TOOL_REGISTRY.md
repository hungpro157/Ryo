# Tool Registry

Tool registry là allowlist trung tâm giữa planner và runtime tool implementations. Plan không thể gọi tool chưa được đăng ký.

## Tool definition

Mỗi registration cung cấp:

- `name` và `description`;
- danh sách `actions`;
- `validateInput`;
- `execute`;
- timeout và maximum retry;
- `cacheable`, `expensive` và khả năng chạy song song.

Ví dụ khái niệm:

```js
registry.registerTool({
  name: 'youtube.metadata',
  actions: ['get_video_info'],
  validateInput,
  execute,
  timeoutMs: 15000,
  maxRetries: 0,
  cacheable: true,
  expensive: false,
});
```

## Tool hiện có

| Tool | Action | Trạng thái |
| --- | --- | --- |
| `youtube.metadata` | `get_video_info` | Đăng ký khi YouTube service có `getVideoInfo` |
| `youtube.comments` | `analyze` | Đăng ký khi comments tool có `analyzeYoutubeComments` |
| `youtube.transcript` | `summarize`, `search`, `summarize_range` | Chỉ đăng ký khi có transcript adapter thật |

Memory tool chưa được đăng ký vì repository chưa có runtime planner adapter tương ứng.

## Input safety

Registry chỉ chấp nhận object có key an toàn, kích thước giới hạn và scalar/array/object lồng có kiểm soát. `file:` và `javascript:` inputs bị từ chối. URL YouTube vẫn được tool chuyên biệt parse và validate.

Executor deduplicate call theo tổ hợp `tool + action + input`. Tool-level cache hiện có, như YouTube comment cache, vẫn tiếp tục được tái sử dụng.
