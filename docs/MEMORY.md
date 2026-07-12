# Memory

Ryo có hai nhóm lưu trữ riêng biệt: SQLite conversation memory và LanceDB knowledge retrieval.

## SQLite conversation memory

SQLite lưu message gần đây và conversation summary. Mọi thao tác hội thoại dùng scope chính xác:

```text
guildId + channelId + userId
```

Điều này ngăn lịch sử của user/channel/guild khác bị đưa vào cùng cuộc trò chuyện. API chính nằm tại `src/database/sqlite/memory.js` và được re-export qua `src/ai/memory/conversation.js`.

Các thao tác gồm:

- thêm và lấy recent messages;
- lấy các message chưa summarize;
- lưu/lấy conversation summary;
- xóa theo user, channel hoặc guild khi được yêu cầu;
- thống kê và giới hạn kích thước database.

Bot không tự xóa database. Chỉ chạy lệnh sau khi operator yêu cầu rõ ràng:

```powershell
npm run db:reset -- --force
```

## Recent-video resolution

Planner tìm URL YouTube trực tiếp trong message trước. Nếu không có, nó duyệt history đã được pipeline nạp cho đúng conversation scope. URL được resolve trước execution và plan lưu URL cụ thể, không lưu cụm mơ hồ như “video lúc nãy”.

Hiện chưa có bảng recent-video chuyên dụng hoặc ordinal resolver đầy đủ cho “video đầu tiên/video thứ hai”.

## LanceDB knowledge và private memory

- General uploaded knowledge được scope bằng `guildId`.
- Private user memory được scope bằng cả `guildId` và `userId`.
- Tên vector field bắt buộc là `vector`.
- Metadata casing bắt buộc là `guildId`, `channelId`, `userId`.

Không log private memory content, full DM content hoặc dữ liệu truy xuất nhạy cảm.
