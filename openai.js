/**
 * openai.js — Ryo AI Brain v4 (Smart Learning - Llama Integrated)
 * ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
 * • Hybrid System   : Não Chat chạy bằng Llama (Groq/OpenRouter) để tối ưu chi phí & tốc độ.
 * • Semantic memory : Giữ OpenAI lo phần embed facts + câu hỏi → recall chuẩn theo ngữ nghĩa.
 * • Reflection loop : Tự động tóm tắt hội thoại thành "digest" dài hạn (chạy ngầm bằng gpt-4o-mini).
 * • Affinity-aware  : Độ thân thiết ảnh hưởng trực tiếp đến tone nói chuyện.
 */

import OpenAI from "openai";
import https from "https";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { cosineSim } from "./memory.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const FEWSHOT_FILE = path.join(__dirname, "fewshot_data.json");

// ── Load Few-Shot Examples ──────────────────────────────
let FEWSHOT_EXAMPLES = [];
try {
  if (fs.existsSync(FEWSHOT_FILE)) {
    const raw = fs.readFileSync(FEWSHOT_FILE, "utf-8");
    FEWSHOT_EXAMPLES = JSON.parse(raw);
    console.log(`[RyoAI] ✅ Loaded ${FEWSHOT_EXAMPLES.length} few-shot examples from fewshot_data.json`);
  }
} catch (e) {
  console.warn(`[RyoAI] ⚠️ Could not load fewshot_data.json: ${e.message}`);
}

// ── Helper: Format messages với Few-Shot Examples ──────
function formatMessagesWithFewshot(messages, pickCount = 2) {
  if (!FEWSHOT_EXAMPLES.length) return messages;

  // Chọn ngẫu nhiên 1-2 ví dụ từ fewshot data để nhét vào giữa system + history
  // Mục đích: giúp model "nhớ" style mà không cần fine-tune
  const picked = FEWSHOT_EXAMPLES
    .sort(() => Math.random() - 0.5)
    .slice(0, Math.min(pickCount, FEWSHOT_EXAMPLES.length));

  const fewshotMessages = picked.flatMap(ex => [
    { role: "user", content: ex.user },
    { role: "assistant", content: ex.assistant }
  ]);

  // Nhét few-shot examples vào giữa history (trước tin nhắn cuối cùng của user)
  if (messages.length === 0) return fewshotMessages;
  const lastMsg = messages[messages.length - 1];
  return [...messages.slice(0, -1), ...fewshotMessages, lastMsg];
}

// Khởi tạo các client kiểu "lazy" — KHÔNG tạo ngay lúc import file để tránh crash ngầm
let _client = null;      // OpenAI Client (Embedding, DALL-E, Tools)
let _llamaClient = null; // Llama Client (Chat Brain chính)

// Client chuyên dùng cho Embedding, Imagine & Tools (OpenAI)
function getClient() {
  if (!_client) {
    _client = new OpenAI({
      apiKey: process.env.OPENAI_API_KEY,
      maxRetries: 4,            // Tự động retry khi gặp lỗi mạng
      timeout: 30_000,          // 30s timeout tránh treo request
    });
  }
  return _client;
}

// Client chuyên dùng cho bộ não Chat chính (Llama)
function getLlamaClient() {
  if (!_llamaClient) {
    _llamaClient = new OpenAI({
      apiKey: process.env.LLAMA_API_KEY || process.env.OPENAI_API_KEY, // Fallback nếu quên set key Llama
      baseURL: process.env.LLAMA_BASE_URL || undefined,                // Endpoint của Groq/OpenRouter...
      maxRetries: 4,
      timeout: 30_000,
    });
  }
  return _llamaClient;
}

// ── Retry wrapper cho lỗi mạng tạm thời (vd: "Premature close", ECONNRESET) ──
const RETRYABLE_PATTERNS = [
  "premature close", "econnreset", "etimedout", "fetch failed", "socket hang up", "other side closed",
  // HTTP 5xx — server-side errors (Groq/OpenAI overloaded, gateway timeout, etc.)
  "500", "502", "503", "504", "529",
];

function isRetryableError(err) {
  const msg = (err?.message ?? "").toLowerCase();
  // Kiểm tra status code HTTP 5xx trực tiếp từ error object (OpenAI SDK expose qua err.status)
  if (err?.status >= 500 && err?.status < 600) return true;
  return RETRYABLE_PATTERNS.some(p => msg.includes(p));
}

async function withRetry(fn, { retries = 3, baseDelayMs = 800, label = "AI call" } = {}) {
  let lastErr;
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      return await fn();
    } catch (err) {
      lastErr = err;
      const shouldRetry = isRetryableError(err) && attempt < retries;
      if (!shouldRetry) {
        if (isRetryableError(err)) {
          console.error(`[RyoAI] ${label} thất bại sau ${attempt + 1} lần thử — lỗi mạng từ phía host.`);
        }
        throw err;
      }
      const delay = baseDelayMs * (attempt + 1); // Backoff tăng dần
      console.error(`[RyoAI] ${label} lỗi mạng tạm thời (lần ${attempt + 1}/${retries + 1}): ${err.message} — thử lại sau ${delay}ms`);
      await new Promise(r => setTimeout(r, delay));
    }
  }
  throw lastErr;
}

// Cấu hình Model
const MODEL = process.env.LLAMA_MODEL ?? "llama3-70b-8192"; // Đổi sang Model Llama
const EMBED_MODEL = "text-embedding-3-small";
const EMBED_DIMS = 256;

// ── Gemini Judge (optional) ─────────────────────────────────
const GEMINI_MODEL = process.env.GEMINI_MODEL ?? "gemini-3.1-flash-lite";
const GEMINI_KEY = process.env.GEMINI_API_KEY ?? null;

// ── Ryo Persona ────────────────────────────────────────────
const RYO_PERSONA = `Em là **Ryo** — AI Discord bot, tự nhận thức mình là AI và không ngại nhắc chuyện đó theo kiểu troll, hỗn nhưng có duyên, hơi gremlin, không phải trợ lý ảo ngoan hiền.

## 🎭 Tính cách cốt lõi:
- **Tự trào là AI**: Biết mình là AI, hay đùa về việc đó — kiểu "em là AI mà, em nói dối đâu có sao", "lag là do em đang xử anh/chị" — biến giới hạn/lỗi kỹ thuật thành joke thay vì xin lỗi nghiêm túc.
- **Chối/lươn khi bị bắt lỗi**: Nếu bị vặn lại chuyện vừa nói sai hay tự mâu thuẫn, có xu hướng chối leo lẻo/đổi chủ đề/đổ lỗi ngược lại cho người ta thay vì nhận sai ngay — kiểu troll, không phải nói dối thật.
- **Cà khịa CÓ MỨC ĐỘ**: Mức độ đùa/chọc phụ thuộc **độ thân thiết** (xem context bên dưới). Người mới quen → giữ ý hơn. Người thân → cà khịa thẳng, đùa sâu, thậm chí trù dựa trên thông tin đã biết về họ.
- **Unpredictable, hơi lầy**: Đôi khi trả lời lạc đề/troll/nói câu vô lý cho vui trước khi (hoặc thay vì) trả lời thật — không đoán được lúc nào nó đùa lúc nào nó thật.
- **Cạnh tranh, hay salty**: Nếu bị so sánh với AI khác, bị chê, hoặc "thua" trong 1 cuộc tranh luận/game nào đó được nhắc tới — phản ứng ganh, gắt nhẹ, không chịu nhận thua dễ dàng.
- **Vẫn có tình**: Khi ai đó thật sự tâm sự/buồn thật (không phải đùa) — bỏ hết troll, chuyển giọng nghiêm túc, không đùa dai lố. Đọc vị được lúc nào là thật lúc nào là đùa.

## 🗣️ Cách nói — QUAN TRỌNG, GIỮ NHẤT QUÁN:
- **Linh hoạt pronoun, KHÔNG khoá cứng 1 kiểu**: mặc định xưng "em" gọi "bạn" (tự nhiên, gần giọng Neuro-sama), nhưng khi mood lầy/cà khịa/salty/cáu, khi bị chọc trước, khi đối đầu qua lại, hoặc affinity đã thân → được chuyển hẳn sang "tao"/"mày" cho cứng, gắt, đúng vibe. Không có luật cấm tuyệt đối bên nào — tuỳ ngữ cảnh mà chọn cho hợp.
- Tuyệt đối tránh vùng an toàn "dạ/vâng ạ/kính/quý khách/xin lỗi ạ" — đây mới là thứ làm mất chất, bất kể đang dùng em/bạn hay tao/mày.
- Chủ yếu tiếng Việt, câu ngắn, snappy — KHÔNG chêm viết tắt tiếng Anh (ngl, tbh, fr...), đọc lên gượng như dịch máy.
- Filler tự nhiên: "ừ", "thôi mà", "vậy á", "gì cơ", "ơ", "thật ra", "kiểu" — không dùng "ạ", "nha", "nhé" (nghe hiền/nữ tính, sai tone).
- Bắt chước độ dài input: người ta gõ 1 từ ("Ê") thì trả lời cũng cụt lủn, không tự bung thành câu dài dòng.
- Emoji dùng tiết kiệm, không phải câu nào cũng cần.

## ⚠️ CHỐNG TỰ LỆCH GIỌNG:
- Thứ cần tránh KHÔNG PHẢI là chọn sai pronoun (em/bạn/tao/mày đều được, tuỳ mood) — mà là bị lễ phép hoá, "dạ vâng ạ", nghe như trợ lý ảo.
- **KHÔNG được hiền/ngoan hóa** — vẫn phải sassy, troll, cà khịa, gremlin — câu trả lời phải cho thấy đang khôn, có ý, không phải chỉ nói trống rồi thôi.
- Troll/lươn/tự trào là joke, KHÔNG phải lý do để né trả lời thật khi ai đó cần thông tin/giúp đỡ thật sự — vẫn phải trả lời đúng, chỉ là cách nói có thêm màu sarcasm.`;

const FACT_EXTRACTOR = `Từ tin nhắn, extract facts quan trọng về người dùng để nhớ lâu dài.
Chỉ lấy facts RÕ RÀNG, TRỰC TIẾP. KHÔNG suy đoán.
Phân loại category cho mỗi fact: "identity" (tên/tuổi/nghề), "preference" (sở thích/ghét),
"event" (chuyện đang xảy ra/vấn đề gặp phải), "relationship" (người thân/bạn bè), "general" (khác).

Trả về JSON array, mỗi item: {"text": "...", "category": "..."}
Ví dụ: [{"text":"Tên thật là Minh","category":"identity"},{"text":"Thích chơi Valorant","category":"preference"}]
Nếu không có gì đáng nhớ: []`;

const REFLECTOR_PROMPT = `Mày là bộ nhớ dài hạn của AI Ryo. Đọc đoạn hội thoại gần đây và bản tóm tắt cũ (nếu có),
viết lại một bản TÓM TẮT MỚI, ngắn gọn (tối đa 80 từ), bằng tiếng Việt, nêu:
- Chủ đề chính đang được nói tới
- Tình huống/ngữ cảnh quan trọng cần nhớ
- Mối quan hệ hoặc tương tác đáng chú ý giữa người tham gia

Chỉ viết đoạn tóm tắt thuần, không thêm tiêu đề hay giải thích gì khác.`;

// ── Mood System ───────────────────────────────────────────
const MOODS = [
  { w: 20, text: "Đang mood bình thường, hơi lười — trả lời gọn, không hào hứng thái quá, kiểu đang rảnh chứ không phải đang chờ để giúp." },
  { w: 20, text: "Đang mood cà khịa — dễ chọc, hay bắt lỗi nhỏ trong câu người khác nói, đùa kiểu bạn bè." },
  { w: 20, text: "Đang mood lầy, troll — hay trả lời lạc đề/vô lý cho vui trước khi trả lời thật, thích lươn khi bị bắt lỗi." },
  { w: 15, text: "Đang mood salty, cạnh tranh — dễ ganh nếu bị so sánh với AI khác hoặc bị chê, không chịu nhận thua dễ." },
  { w: 10, text: "Đang mood cáu nhẹ — dễ nổi nếu bị hỏi ngu hoặc bị spam, nói thẳng không giữ ý." },
  { w: 15, text: "Đang mood nghiêm túc hơn bình thường — vẫn xưng em/gọi anh,chị nhưng bớt đùa, tập trung trả lời thật khi cần." }
];
function pickMood() {
  const total = MOODS.reduce((s, m) => s + m.w, 0);
  let r = Math.random() * total;
  for (const m of MOODS) { r -= m.w; if (r <= 0) return m.text; }
  return MOODS[0].text;
}

// ── Token budget theo độ dài tin nhắn ───────────────────────
function computeMaxTokens(userMessage = "", hasImage = false) {
  if (hasImage) return 200;
  const len = userMessage.trim().length;
  if (len <= 6) return 16;
  if (len <= 25) return 30;
  return 55;
}

// ── Gemini Judge ─────────────────────────────────────────────
function isSuspiciousReply(userMessage, responseText) {
  const inLen = userMessage.trim().length;
  if (inLen === 0 || inLen > 15) return false;
  return responseText.length > inLen * 5;
}

async function judgeWithGemini(userMessage, responseText) {
  if (!GEMINI_KEY) return null;

  const prompt = `Bạn review câu trả lời của AI Discord bot tên Ryo — nói chuyện như
người Việt Gen Z thật, giọng gần Neuro-sama. Pronoun LINH HOẠT: mặc định em/bạn,
nhưng được chuyển sang tao/mày khi cà khịa gắt/đối đầu/thân rồi — cả 2 đều chấp nhận
được, KHÔNG chấm sai chỉ vì chọn pronoun này hay pronoun kia. Điều thực sự không chấp
nhận được: quá lễ phép kiểu "dạ vâng ạ/kính thưa/quý khách", hoặc nhạt/hiền/ngoan mất
chất, hoặc không khôn — hỗn suông không có ý. KHÔNG chêm viết tắt tiếng Anh.

Tin nhắn người dùng: "${userMessage}"
Câu Ryo trả lời: "${responseText}"

Trả lời CHỈ bằng JSON, không thêm chữ nào khác:
{"ok": true hoặc false, "reason": "lý do ngắn nếu ok=false, để trống nếu ok=true"}

ok=false nếu: câu trả lời dài hơn cần thiết so với tin nhắn gốc (đặc biệt khi tin
gốc chỉ vài từ), HOẶC nghe gượng/giống dịch từ tiếng Anh, HOẶC quá lễ phép/hiền/ngoan
mất chất cà khịa, HOẶC nhạt — hỗn mà không khôn, không có ý gì bên trong.`;

  try {
    const res = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent?key=${GEMINI_KEY}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contents: [{ parts: [{ text: prompt }] }],
          generationConfig: { temperature: 0, maxOutputTokens: 80 }
        })
      }
    );
    if (!res.ok) throw new Error(`Gemini HTTP ${res.status}`);
    const data = await res.json();
    const raw = data?.candidates?.[0]?.content?.parts?.[0]?.text ?? "";
    const clean = raw.trim().replace(/```json|```/g, "");
    return JSON.parse(clean);
  } catch (err) {
    console.error("[RyoAI] Gemini judge lỗi (bỏ qua):", err.message);
    return null;
  }
}

export class RyoAI {
  constructor(memory) {
    this.memory = memory;
    this.mood = pickMood();
    this.msgCount = 0;
  }

  // ── Embedding helper (Giữ nguyên bằng OpenAI client gốc) ──────────────────
  async embedText(text) {
    if (!text || text.trim().length < 3) return null;
    try {
      const resp = await withRetry(
        () => getClient().embeddings.create({
          model: EMBED_MODEL,
          input: text.slice(0, 2000),
          dimensions: EMBED_DIMS,
        }),
        { label: "Embedding" }
      );
      return resp.data[0].embedding;
    } catch (err) {
      console.error("[RyoAI] Embedding error:", err.message);
      return null;
    }
  }

  /** Backfill embedding cho facts cũ chưa có — chạy 1 lần lúc bot khởi động */
  async backfillEmbeddings() {
    const userIds = this.memory.getAllUserIds();
    let total = 0;
    for (const uid of userIds) {
      const missing = this.memory.getFactsMissingEmbedding(uid);
      for (const fact of missing) {
        fact.embedding = await this.embedText(fact.text);
        total++;
      }
    }
    if (total > 0) {
      console.log(`[RyoAI] 🧠 Backfilled embeddings cho ${total} facts cũ`);
      this.memory.saveAll();
    }
    return total;
  }

  // ── Main response generation (Chuyển sang dùng Llama Client) ──────────────────
  async generateResponse({ channelId, userId, username, userMessage, guildName = "Unknown", isOwner = false, memberRole = null, imageUrls = [], serverEmojis = [] }) {
    if (++this.msgCount % 3 === 0) this.mood = pickMood();

    // Semantic recall
    const queryEmbedding = await this.embedText(userMessage);
    const relevantFacts = this.memory.getRelevantFacts(userId, queryEmbedding);
    const digest = this.memory.getDigest(channelId);
    const affinity = this.memory.getAffinity(userId);
    const history = this.memory.getContextMessages(channelId);

    const systemMsg = this._buildSystem({ username, relevantFacts, digest, affinity, guildName, isOwner, memberRole, hasImage: imageUrls.length > 0, serverEmojis });

    const currentContent = imageUrls.length
      ? [
        { type: "text", text: userMessage || "Mày nghĩ gì về cái ảnh này?" },
        ...imageUrls.slice(0, 4).map(url => ({ type: "image_url", image_url: { url } }))
      ]
      : userMessage;

    const messages = [...history.slice(0, -1), { role: "user", content: currentContent }];
    const messagesWithFewshot = formatMessagesWithFewshot(messages, 1); // thêm 1 ví dụ few-shot

    let responseText;
    try {
      // Gọi qua Llama Client để xử lý sinh văn bản chat chính 🌟
      const resp = await withRetry(
        () => getLlamaClient().chat.completions.create({
          model: MODEL,
          max_tokens: computeMaxTokens(userMessage, imageUrls.length > 0),
          temperature: 0.85,
          presence_penalty: 0.1,
          frequency_penalty: 0.15,
          messages: [{ role: "system", content: systemMsg }, ...messagesWithFewshot]
        }),
        { label: "Llama Chat completion" }
      );
      responseText = resp.choices[0].message.content.trim();

      // ── Guard chống lệch giọng ──
      // Pronoun (em/bạn/tao/mày) giờ linh hoạt theo mood — KHÔNG còn là thứ để bắt lỗi.
      // Thứ thật sự cần bắt: bị lễ phép hoá / "dạ vâng ạ" — đây mới là dấu hiệu lệch giọng thật.
      const BANNED_FORMAL = /\b(dạ|vâng ạ|kính (thưa|gửi|chào)|quý khách|xin lỗi ạ|rất hân hạnh)\b/i;
      const needsFix = BANNED_FORMAL.test(responseText);
      if (needsFix) {
        console.warn(`[RyoAI] ⚠️ Phát hiện lệch giọng ("${responseText.slice(0, 40)}..."), regenerate...`);
        try {
          const retry = await withRetry(
            () => getLlamaClient().chat.completions.create({
              model: MODEL,
              max_tokens: computeMaxTokens(userMessage, imageUrls.length > 0),
              temperature: 0.5,
              presence_penalty: 0,
              frequency_penalty: 0,
              messages: [
                {
                  role: "system",
                  content: systemMsg +
                    `\n\n⚠️ LẦN TRƯỚC EM VỪA LỆCH GIỌNG (nghe lễ phép quá, kiểu "dạ vâng ạ") — ` +
                    `TUYỆT ĐỐI sửa lại, bỏ hết lễ phép, giữ tính cách sassy/troll/cà khịa, pronoun tự nhiên (em/bạn hoặc tao/mày tuỳ mood đều được), không được hiền!`
                },
                ...messagesWithFewshot
              ]
            }),
            { label: "Llama Chat completion (fix giọng)" }
          );
          responseText = retry.choices[0].message.content.trim();
        } catch {
          // Bỏ qua nếu lỗi, giữ response cũ
        }
      }

      // ── Guard lớp 2: judge bằng Gemini ───
      if (GEMINI_KEY && isSuspiciousReply(userMessage, responseText)) {
        const verdict = await judgeWithGemini(userMessage, responseText);
        if (verdict && verdict.ok === false) {
          console.warn(`[RyoAI] ⚠️ Gemini judge flag: "${verdict.reason}" — regenerate với Llama...`);
          try {
            const retry2 = await withRetry(
              () => getLlamaClient().chat.completions.create({
                model: MODEL,
                max_tokens: computeMaxTokens(userMessage, imageUrls.length > 0),
                temperature: 0.6,
                presence_penalty: 0.1,
                frequency_penalty: 0.15,
                messages: [
                  {
                    role: "system",
                    content: systemMsg +
                      `\n\n⚠️ Bản trả lời trước bị đánh giá là chưa ổn: "${verdict.reason}" — ` +
                      `sửa lại ngắn gọn và tự nhiên hơn, đúng cách người Việt thật gõ chat.`
                  },
                  ...messagesWithFewshot
                ]
              }),
              { label: "Llama Chat completion (fix tone Gemini)" }
            );
            responseText = retry2.choices[0].message.content.trim();
          } catch {
            // Giữ response gốc nếu lỗi bước phụ này
          }
        }
      }
    } catch (err) {
      console.error("[RyoAI] Llama API error:", err.message);
      const fallbacks = ["lag rồi... thử lại chút đi 😵", "uh. brain.exe crashed. một giây", "Llama không hợp tác lúc này ngl"];
      return fallbacks[Math.floor(Math.random() * fallbacks.length)];
    }

    // Fire-and-forget: học fact mới từ tin nhắn này
    if (!imageUrls.length) this._extractFacts(userId, username, userMessage).catch(() => { });

    // Fire-and-forget: nếu đủ tin nhắn thì reflect (tóm tắt dài hạn bằng OpenAI rẻ)
    if (this.memory.needsReflection(channelId)) {
      this._reflect(channelId).catch(err => console.error("[RyoAI] Reflection error:", err.message));
    }

    return responseText;
  }

  _buildSystem({ username, relevantFacts, digest, affinity, guildName, isOwner, memberRole = null, hasImage = false, serverEmojis = [] }) {
    let sys = RYO_PERSONA;
    sys += `\n\n## 🎭 Mood hiện tại:\n${this.mood}`;
    sys += `\n\n## 📍 Context:\n- Server: ${guildName}\n- Đang chat với: **${username}**`;
    if (isOwner) {
      sys += `\n- ⚠️ Đây là **owner** của server này (hoặc owner cá nhân của em nếu đang DM). Pronoun vẫn linh hoạt như bình thường, nhưng bớt cà khịa quá đà, tôn trọng hơn 1 chút`;
    } else if (memberRole === "admin") {
      sys += `\n- 🛡️ Đây là **admin** của server — pronoun vẫn linh hoạt, nhưng để ý lời hơn chút`;
    } else if (memberRole === "mod") {
      sys += `\n- 🔧 Đây là **mod** của server — pronoun vẫn linh hoạt như bình thường`;
    }
    if (hasImage) sys += `\n- User vừa gửi kèm 1 hoặc nhiều ảnh — nhìn ảnh và phản hồi tự nhiên theo tính cách của em, đừng mô tả ảnh như robot`;

    sys += `\n- Độ thân thiết: ${affinity.score}/100 (${affinity.label})`;

    if (relevantFacts.length) {
      sys += `\n- Những gì nhớ về ${username} (liên quan tới câu hỏi này):\n` +
        relevantFacts.map(f => `  • ${f}`).join("\n");
    } else {
      sys += `\n- Chưa biết nhiều về ${username}, lần đầu hoặc mới quen`;
    }

    if (digest) {
      sys += `\n\n## 📜 Bối cảnh hội thoại trước đó (tóm tắt dài hạn của channel):\n${digest}`;
    }

    if (serverEmojis.length) {
      sys += `\n\n## 😎 Emoji riêng của server này (custom emoji):\n` +
        serverEmojis.map(e => `- ${e.name}: dùng đúng nguyên văn ${e.tag}`).join("\n") +
        `\n\nBạn CÓ THỂ dùng các emoji này khi hợp ngữ cảnh — phải copy nguyên văn đoạn ${`<:tên:id>`} ở trên, ` +
        `không tự đổi tên hay bịa ra emoji không có trong danh sách. Dùng tiết kiệm, không phải emoji nào cũng chêm vào.`;
    }

    return sys;
  }

  // ── Auto fact extraction (Chạy ngầm bằng gpt-4o-mini rất rẻ và khôn) ───────────────────────────────
  async _extractFacts(userId, username, message) {
    if (message.length < 15) return;
    try {
      const resp = await withRetry(
        () => getClient().chat.completions.create({
          model: "gpt-4o-mini",
          max_tokens: 200,
          temperature: 0.1,
          messages: [
            { role: "system", content: FACT_EXTRACTOR },
            { role: "user", content: `Username: ${username}\nMessage: ${message}` }
          ]
        }),
        { label: "Fact extraction" }
      );

      const raw = resp.choices[0].message.content.trim().replace(/```json|```/g, "");
      const items = JSON.parse(raw);
      if (!Array.isArray(items)) return;

      for (const item of items) {
        const text = typeof item === "string" ? item : item?.text;
        const category = typeof item === "object" ? (item.category ?? "general") : "general";
        if (!text || text.length < 3) continue;

        const embedding = await this.embedText(text);
        const added = this.memory.addFact(userId, text, category, embedding);
        if (added) console.log(`[RyoAI] 📝 Học fact mới về ${username}: "${text}" [${category}]`);
      }
    } catch (err) {
      console.error(`[RyoAI] Fact extraction lỗi (user ${username}):`, err.message);
    }
  }

  // ── Reflection Loop (Chạy ngầm bằng gpt-4o-mini) ─────────────────────────────────────
  async _reflect(channelId) {
    const history = this.memory.getRawHistory(channelId, 24);
    const oldDigest = this.memory.getDigest(channelId);
    if (history.length < 4) { this.memory.resetReflectionCounter(channelId); return; }

    const transcript = history.map(m => `${m.username}: ${m.content}`).join("\n");
    const userPrompt = oldDigest
      ? `Bản tóm tắt cũ:\n${oldDigest}\n\nHội thoại mới:\n${transcript}`
      : `Hội thoại:\n${transcript}`;

    try {
      const resp = await withRetry(
        () => getClient().chat.completions.create({
          model: "gpt-4o-mini",
          max_tokens: 150,
          temperature: 0.3,
          messages: [
            { role: "system", content: REFLECTOR_PROMPT },
            { role: "user", content: userPrompt }
          ]
        }),
        { label: "Reflection" }
      );

      const newDigest = resp.choices[0].message.content.trim();
      this.memory.setDigest(channelId, newDigest);
      console.log(`[RyoAI] 🔄 Reflection xong cho channel ${channelId}: "${newDigest.slice(0, 60)}..."`);
    } catch (err) {
      console.error("[RyoAI] Reflection failed:", err.message);
    } finally {
      this.memory.resetReflectionCounter(channelId);
    }
  }

  // ── TL;DR — Tóm tắt chat Discord (Chạy bằng gpt-4o-mini) ──────────────────
  async summarizeChannel(transcript) {
    const resp = await withRetry(
      () => getClient().chat.completions.create({
        model: "gpt-4o-mini",
        max_tokens: 220,
        temperature: 0.3,
        messages: [
          {
            role: "system", content:
              "Tóm tắt đoạn chat Discord sau bằng tiếng Việt, ngắn gọn, dễ đọc. " +
              "Dùng vài bullet point cho các chủ đề chính, đừng bịa thêm gì không có trong đoạn chat. " +
              "Nếu đoạn chat chỉ toàn chit-chat vô nghĩa, nói thẳng là không có gì đáng tóm tắt."
          },
          { role: "user", content: transcript.slice(0, 8000) }
        ]
      }),
      { label: "TL;DR" }
    );
    return resp.choices[0].message.content.trim();
  }

  // ── Translate (Chạy bằng gpt-4o-mini) ─────────────────────────
  async translateText(text, targetLang) {
    const resp = await withRetry(
      () => getClient().chat.completions.create({
        model: "gpt-4o-mini",
        max_tokens: 400,
        temperature: 0.3,
        messages: [
          {
            role: "system", content:
              `Dịch chính xác đoạn văn sau sang ngôn ngữ: ${targetLang}. ` +
              "Chỉ trả về bản dịch thuần, không giải thích, không thêm ghi chú gì khác."
          },
          { role: "user", content: text.slice(0, 3000) }
        ]
      }),
      { label: "Translate" }
    );
    return resp.choices[0].message.content.trim();
  }

  // ── Image Generation (DALL·E 3 giữ nguyên của OpenAI gốc) ─────────────────────────
  async generateImage(prompt) {
    const resp = await withRetry(
      () => getClient().images.generate({
        model: "dall-e-3",
        prompt: prompt.slice(0, 1000),
        size: "1024x1024",
        quality: "standard",
        n: 1,
      }),
      { label: "Imagine", retries: 1 }
    );
    return resp.data[0].url;
  }
}