# YouTube Tools

Ryo hiện hỗ trợ metadata và comment intelligence qua YouTube Data API. Các request được chuẩn hóa trước khi đưa evidence vào prompt.

## URL support

Parser hỗ trợ URL video chuẩn, `youtu.be`, Shorts và URL có query parameters. Tool chỉ nhận URL/video ID đã qua luồng kiểm soát; planner không cho gọi arbitrary web URL.

## Metadata

`youtube.metadata/get_video_info` lấy normalized video information. Planner dùng metadata khi request cần thông tin video hoặc làm dependency chung cho compound plan.

## Comments

`youtube.comments/analyze` lấy một mẫu comment có giới hạn rồi:

- chuẩn hóa text và metadata;
- loại emoji-only, “first”, spam và engagement bait;
- gộp duplicate/near-duplicate;
- phân loại sentiment/topic;
- chọn exact representative quotes;
- trả về counts, topics, sample details và limitations thay vì raw dump.

Các mode gồm overall reaction, praise, criticism, problems, questions, disagreement, useful/funny comments, topic search và representative sample.

Comment là ý kiến người xem, không phải sự thật từ nội dung video. Prompt và evidence store giữ comments tách khỏi transcript.

## Transcript

Planner hiểu các action `summarize`, `search` và `summarize_range`, đồng thời giữ timestamp trong evidence. Tuy nhiên checkout hiện tại chưa chứa production transcript retriever. Tool chỉ xuất hiện trong registry khi một adapter thật được inject.

## Failure behavior

- Missing URL: hỏi một câu clarification ngắn, trừ khi scoped history resolve được URL.
- Empty filtered comments: thông báo không tìm thấy comment đủ nội dung.
- Optional step lỗi: giữ evidence đã thành công và đánh dấu partial result.
- Required dependency lỗi: dependent steps bị skip.
- Planner không khả dụng: dùng legacy YouTube routing.

Automated tests dùng mock, không gọi YouTube, Discord hoặc Ollama thật.
