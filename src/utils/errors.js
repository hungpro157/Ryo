export class AppError extends Error {
  constructor(code, message, options = {}) {
    super(message, options.cause ? { cause: options.cause } : undefined);
    this.name = 'AppError';
    this.code = code;
    this.status = options.status ?? null;
  }
}

const USER_MESSAGES = {
  CONFIG_MISSING: 'bot đang thiếu cấu hình cần thiết.',
  INVALID_INPUT: 'nội dung yêu cầu chưa hợp lệ.',
  INVALID_YOUTUBE_URL: 'link YouTube không hợp lệ.',
  YOUTUBE_VIDEO_NOT_FOUND: 'không tìm thấy video này.',
  YOUTUBE_COMMENTS_DISABLED: 'video này đã tắt bình luận.',
  YOUTUBE_QUOTA_EXCEEDED: 'YouTube API đang hết lượt dùng, thử lại sau nha.',
  TOOL_TIMEOUT: 'tool phản hồi quá lâu, thử lại sau nha.',
  TOOL_RATE_LIMIT: 'tool đang bị giới hạn, thử lại sau nha.',
  OLLAMA_UNAVAILABLE: 'Ollama chưa sẵn sàng trên máy.',
  OLLAMA_MODEL_NOT_FOUND: 'model Ollama đang cấu hình chưa có trên máy.',
  OLLAMA_TIMEOUT: 'Ollama phản hồi quá lâu, thử lại sau nha.',
  OLLAMA_INVALID_RESPONSE: 'Ollama trả về dữ liệu không hợp lệ.',
  RESPONSE_VALIDATION_FAILED: 'mình chưa tạo được câu trả lời an toàn.',
  INTERNAL_ERROR: 'có lỗi nội bộ rồi, thử lại sau nha.',
};

export function classifyError(error) {
  if (error instanceof AppError) return error;
  const message = String(error?.message || '');
  if (error?.name === 'AbortError' || /aborted|timeout|timed out/iu.test(message)) return new AppError('OLLAMA_TIMEOUT', message, { cause: error });
  if (/model.+(not found|does not exist)|pull model/iu.test(message)) return new AppError('OLLAMA_MODEL_NOT_FOUND', message, { cause: error });
  if (/Ollama.+unavailable|fetch failed|ECONNREFUSED/iu.test(message)) return new AppError('OLLAMA_UNAVAILABLE', message, { cause: error });
  if (/invalid.+response/iu.test(message)) return new AppError('OLLAMA_INVALID_RESPONSE', message, { cause: error });
  return new AppError('INTERNAL_ERROR', message || 'Internal error', { cause: error });
}

export function userErrorMessage(error) { return USER_MESSAGES[error?.code] || USER_MESSAGES.INTERNAL_ERROR; }
