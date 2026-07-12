export class YouTubeError extends Error {
  constructor(code, message, { status = null, cause = null } = {}) {
    super(message, cause ? { cause } : undefined);
    this.name = 'YouTubeError';
    this.code = code;
    this.status = status;
  }
}

const DISCORD_MESSAGES = {
  INVALID_URL: 'Link hoặc video ID YouTube không hợp lệ.',
  MISSING_API_KEY: 'Tool YouTube chưa được cấu hình API key.',
  VIDEO_NOT_FOUND: 'Không tìm thấy video này; có thể video đã bị xóa hoặc đang để riêng tư.',
  COMMENTS_DISABLED: 'Video này đã tắt bình luận.',
  QUOTA_EXCEEDED: 'YouTube API đang hết quota, thử lại sau nha.',
  API_TIMEOUT: 'YouTube API phản hồi quá lâu, thử lại sau nha.',
  MALFORMED_RESPONSE: 'YouTube trả về dữ liệu không hợp lệ.',
  API_ERROR: 'Không lấy được dữ liệu YouTube lúc này.',
};

export function youtubeErrorMessage(error) {
  return DISCORD_MESSAGES[error?.code] || DISCORD_MESSAGES.API_ERROR;
}
