import { findYouTubeUrl } from '../tools/youtube/youtubeUrl.js';

const COMMENT_REQUEST = /(comment|bình luận|binh luan|phản ứng|phan ung|bị chê|bi che|chê gì|che gi|khen gì|khen gi|báo lỗi|bao loi|đáng chú ý|dang chu y|câu hài|cau hai|liên quan (đến|tới)|lien quan (den|toi)|mọi người.{0,20}(nói|nghĩ)|moi nguoi.{0,20}(noi|nghi))/iu;
const REPLY_REQUEST = /(reply|replies|trả lời bình luận|tra loi binh luan|phản hồi bình luận|phan hoi binh luan)/iu;

function commentMode(text) {
  if (/(khen|praise|thích gì|thich gi)/iu.test(text)) return 'praise';
  if (/(chê|\bche\b|critic|không thích|khong thich)/iu.test(text)) return 'criticism';
  if (/(báo lỗi|bao loi|\blỗi|\bbug\b|\bproblem\b|vấn đề|van de)/iu.test(text)) return 'problems';
  if (/(câu hỏi|cau hoi|hỏi gì|hoi gi|questions?)/iu.test(text)) return 'questions';
  if (/(tranh luận|tranh luan|không đồng ý|khong dong y|disagree)/iu.test(text)) return 'disagreement';
  if (/(đáng chú ý|dang chu y|hay nhất|hay nhat|hữu ích|huu ich|useful)/iu.test(text)) return 'useful_quotes';
  if (/(hài|\bhai\b|buồn cười|buon cuoi|funny)/iu.test(text)) return 'funny_comments';
  if (/(nói về|noi ve|liên quan (đến|tới)|lien quan (den|toi)|tìm comment|tim comment)/iu.test(text)) return 'topic_search';
  if (/(mẫu đại diện|mau dai dien|lọc bỏ comment rác|loc bo comment rac)/iu.test(text)) return 'representative_sample';
  return 'overall_reaction';
}

function topicQuery(text) {
  const withoutUrl = text.replace(/https?:\/\/\S+/giu, '').trim();
  const match = withoutUrl.match(/(?:nói về|noi ve|liên quan (?:đến|tới)|lien quan (?:den|toi))\s+(.+)$/iu);
  return match?.[1]?.replace(/[?.!,]+$/u, '').trim() || null;
}

export function analyzeYouTubeRequest(message, history = []) {
  const text = String(message || '');
  let url = findYouTubeUrl(text);
  if (!url) {
    for (const item of [...history].reverse()) {
      url = findYouTubeUrl(item.content || '');
      if (url) break;
    }
  }
  const limitMatch = text.match(/\blấy\s+(\d+)\b/iu);
  return {
    requested: COMMENT_REQUEST.test(text) || Boolean(url),
    operation: COMMENT_REQUEST.test(text) ? 'comments' : 'video_info',
    includeReplies: REPLY_REQUEST.test(text),
    mode: commentMode(text),
    query: topicQuery(text),
    resultLimit: limitMatch ? Math.min(50, Math.max(1, Number.parseInt(limitMatch[1], 10))) : null,
    url,
  };
}

export function compactYouTubeToolResult(result, operation) {
  if (operation === 'video_info') return { operation, video: result };
  return { operation, ...result };
}
