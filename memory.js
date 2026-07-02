/**
 * memory.js — Ryo Memory System v3 (Smart Memory)
 * ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
 * • Short-term : buffer hội thoại theo channel (30 msgs gần nhất)
 * • Long-term  : facts có embedding → recall theo NGỮ NGHĨA, không chỉ theo thời gian
 * • Digest     : bản tóm tắt dài hạn mỗi channel, tự cập nhật qua Reflection Loop
 * • Affinity   : độ thân thiết tăng dần theo số lần tương tác → ảnh hưởng tone nói chuyện
 * • Persistent : lưu JSON vào disk, tự backup mỗi 5 phút
 */

import fs   from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname  = path.dirname(fileURLToPath(import.meta.url));
const MEM_DIR    = path.join(__dirname, "memory_data");

const CH_FILE      = path.join(MEM_DIR, "channels.json");
const USR_FILE     = path.join(MEM_DIR, "users.json");
const FACTS_FILE   = path.join(MEM_DIR, "facts.json");
const DIGEST_FILE  = path.join(MEM_DIR, "digests.json");
const STATS_FILE   = path.join(MEM_DIR, "stats.json");

const MAX_HISTORY         = 30;   // messages giữ trong RAM/channel
const MAX_STORED          = 100;  // messages lưu vào disk/channel
const CTX_WINDOW          = 20;   // messages gửi cho OpenAI mỗi lần
const REFLECT_EVERY       = 12;   // số tin nhắn user trước khi reflect 1 lần
const MAX_FACTS_PER_USER  = 60;
const RELEVANT_FACTS_TOPK = 8;    // top-K facts liên quan nhất được nhét vào prompt

if (!fs.existsSync(MEM_DIR)) fs.mkdirSync(MEM_DIR, { recursive: true });

function readJSON(file, fallback = {}) {
  try { if (fs.existsSync(file)) return JSON.parse(fs.readFileSync(file, "utf-8")); }
  catch (e) { console.error(`[Memory] Lỗi đọc ${path.basename(file)}:`, e.message); }
  return fallback;
}
function writeJSON(file, data) {
  fs.writeFileSync(file, JSON.stringify(data, null, 2), "utf-8");
}

// ── Cosine similarity (dùng cho semantic search) ───────────
export function cosineSim(a, b) {
  if (!a || !b || a.length !== b.length) return 0;
  let dot = 0, na = 0, nb = 0;
  for (let i = 0; i < a.length; i++) { dot += a[i]*b[i]; na += a[i]*a[i]; nb += b[i]*b[i]; }
  if (na === 0 || nb === 0) return 0;
  return dot / (Math.sqrt(na) * Math.sqrt(nb));
}

// ── Affinity → mức độ thân thiết ───────────────────────────
export function affinityLabel(score) {
  if (score < 8)  return "mới quen, chưa biết nhiều về người này — vẫn xưng tao/mày như bình thường, chỉ là chưa có nhiều info để đùa sâu";
  if (score < 25) return "đang quen dần, đã có vài lần chat";
  if (score < 50) return "khá thân, đùa thoải mái hơn bình thường";
  return "rất thân, gần như bạn bè lâu năm — được đùa sâu, cà khịa thẳng hơn, ít cần giữ ý";
}

export class MemorySystem {
  constructor() {
    this.channels = new Map();        // channelId -> [{role,userId,username,content,ts}]
    this.reflectCounter = new Map();  // channelId -> số msg user kể từ lần reflect cuối

    this.users   = readJSON(USR_FILE,    {});
    this.digests = readJSON(DIGEST_FILE, {});
    this.stats   = readJSON(STATS_FILE,  { totalMessages: 0, sessions: 0 });
    this.stats.sessions = (this.stats.sessions ?? 0) + 1;

    // Facts: migrate format cũ (array string) → format mới (array object + embedding)
    const rawFacts = readJSON(FACTS_FILE, {});
    this.facts = {};
    for (const [uid, list] of Object.entries(rawFacts)) {
      this.facts[uid] = (list ?? []).map(f =>
        typeof f === "string"
          ? { text: f, category: "general", embedding: null, createdAt: Date.now() }
          : f
      );
    }

    const savedCh = readJSON(CH_FILE, {});
    for (const [id, msgs] of Object.entries(savedCh)) {
      this.channels.set(id, msgs.slice(-MAX_HISTORY));
    }

    const totalFacts = Object.values(this.facts).reduce((s, l) => s + l.length, 0);
    console.log(`[Memory] ✅ ${Object.keys(this.users).length} users | ${this.channels.size} channels | ${totalFacts} facts | ${Object.keys(this.digests).length} digests`);

    setInterval(() => this.saveAll(), 5 * 60 * 1000);
  }

  // ── Messages / Channel buffer ───────────────────────────
  addMessage(channelId, userId, username, content, role) {
    if (!this.channels.has(channelId)) this.channels.set(channelId, []);
    const hist = this.channels.get(channelId);

    hist.push({ role, userId, username, content, ts: Date.now(), dt: new Date().toLocaleString("vi-VN") });
    if (hist.length > MAX_HISTORY) hist.splice(0, hist.length - MAX_HISTORY);

    if (role === "user" && userId !== "ryo") {
      this._touchUser(userId, username);
      this.bumpAffinity(userId);
      this.stats.totalMessages = (this.stats.totalMessages ?? 0) + 1;

      const c = (this.reflectCounter.get(channelId) ?? 0) + 1;
      this.reflectCounter.set(channelId, c);
    }
  }

  getContextMessages(channelId) {
    const hist = this.channels.get(channelId) ?? [];
    return hist.slice(-CTX_WINDOW).map(m => ({ role: m.role, content: m.content }));
  }

  /** Lấy raw history (kèm username) — dùng cho reflection prompt */
  getRawHistory(channelId, n = 24) {
    const hist = this.channels.get(channelId) ?? [];
    return hist.slice(-n);
  }

  // ── Reflection trigger ──────────────────────────────────
  needsReflection(channelId) {
    return (this.reflectCounter.get(channelId) ?? 0) >= REFLECT_EVERY;
  }
  resetReflectionCounter(channelId) {
    this.reflectCounter.set(channelId, 0);
  }

  // ── Digest (bộ nhớ dài hạn dạng tóm tắt) ─────────────────
  getDigest(channelId) {
    return this.digests[channelId]?.summary ?? "";
  }
  setDigest(channelId, summary) {
    this.digests[channelId] = { summary, updatedAt: new Date().toISOString() };
  }

  // ── Users & Affinity ─────────────────────────────────────
  _touchUser(userId, username) {
    if (!this.users[userId]) {
      this.users[userId] = {
        username, firstSeen: new Date().toISOString(), lastSeen: new Date().toISOString(),
        msgCount: 0, affinity: 0, notes: []
      };
    }
    const u = this.users[userId];
    u.username = username;
    u.lastSeen = new Date().toISOString();
    u.msgCount = (u.msgCount ?? 0) + 1;
    if (u.affinity === undefined) u.affinity = 0;
  }

  bumpAffinity(userId, amount = 1) {
    if (!this.users[userId]) return;
    this.users[userId].affinity = Math.min(100, (this.users[userId].affinity ?? 0) + amount);
  }

  getAffinity(userId) {
    const score = this.users[userId]?.affinity ?? 0;
    return { score, label: affinityLabel(score) };
  }

  // ── Facts (semantic long-term memory) ────────────────────
  /**
   * Thêm fact mới. Nếu có embedding, dedup theo similarity (>0.92 = coi như trùng).
   * Nếu không có embedding, dedup theo text giống y hệt.
   */
  addFact(userId, text, category = "general", embedding = null) {
    if (!this.facts[userId]) this.facts[userId] = [];
    const list = this.facts[userId];

    const isDup = embedding
      ? list.some(f => f.embedding && cosineSim(f.embedding, embedding) > 0.92)
      : list.some(f => f.text === text);
    if (isDup) return false;

    list.push({ text, category, embedding, createdAt: Date.now() });
    if (list.length > MAX_FACTS_PER_USER) list.splice(0, list.length - MAX_FACTS_PER_USER);
    return true;
  }

  /** Backfill embedding cho facts cũ chưa có (gọi từ openai.js lúc khởi động) */
  getFactsMissingEmbedding(userId) {
    return (this.facts[userId] ?? []).filter(f => !f.embedding);
  }

  getAllUserIds() {
    return Object.keys(this.facts);
  }

  /**
   * Lấy facts liên quan nhất tới câu hỏi hiện tại (semantic search).
   * Nếu không có queryEmbedding (vd. câu quá ngắn), fallback lấy facts gần đây nhất.
   */
  getRelevantFacts(userId, queryEmbedding = null, topN = RELEVANT_FACTS_TOPK) {
    const list = this.facts[userId] ?? [];
    if (!list.length) return [];

    if (!queryEmbedding) {
      return list.slice(-topN).map(f => f.text);
    }

    const scored = list
      .map(f => ({ f, score: f.embedding ? cosineSim(f.embedding, queryEmbedding) : 0 }))
      .sort((a, b) => b.score - a.score);

    // Trộn: top theo similarity + vài cái gần đây nhất (đảm bảo không miss info mới)
    const topSemantic = scored.slice(0, Math.max(topN - 2, 1)).map(s => s.f.text);
    const recent = list.slice(-2).map(f => f.text);
    return [...new Set([...topSemantic, ...recent])];
  }

  // ── Discord embed getters ────────────────────────────────
  getUserProfileText(userId) {
    const profile = this.users[userId];
    if (!profile) return "";
    const facts = (this.facts[userId] ?? []).slice(-6).map(f => f.text);
    const { score, label } = this.getAffinity(userId);

    const lines = [
      `👤 **${profile.username}**`,
      `💬 Đã chat: ${profile.msgCount ?? 0} lần`,
      `❤️ Độ thân: ${score}/100 — ${label}`,
      `🕐 Gặp lần đầu: ${profile.firstSeen?.slice(0,10) ?? "N/A"}`,
    ];
    if (facts.length) {
      lines.push("📝 Tao nhớ:");
      facts.forEach(f => lines.push(`  • ${f}`));
    }
    return lines.join("\n");
  }

  getChannelSummaryText(channelId) {
    const hist   = this.channels.get(channelId) ?? [];
    const digest = this.getDigest(channelId);
    if (!hist.length && !digest) return "";
    const lines = [];
    if (hist.length) lines.push(`💬 ${hist.length} tin nhắn gần đây trong bộ nhớ ngắn hạn`);
    if (digest) lines.push(`📜 Tóm tắt dài hạn: ${digest}`);
    return lines.join("\n");
  }

  getStats() {
    const totalFacts = Object.values(this.facts).reduce((s, l) => s + l.length, 0);
    return {
      totalUsers:    Object.keys(this.users).length,
      totalChannels: [...this.channels.values()].filter(h => h.length).length,
      totalMessages: this.stats.totalMessages ?? 0,
      totalFacts,
      totalDigests:  Object.keys(this.digests).length,
    };
  }

  // ── Clear ─────────────────────────────────────────────────
  clearChannel(channelId) {
    this.channels.set(channelId, []);
    delete this.digests[channelId];
    this.reflectCounter.set(channelId, 0);
    this.saveAll();
  }

  clearUser(userId) {
    delete this.users[userId];
    delete this.facts[userId];
    this.saveAll();
  }

  // ── Persistence ───────────────────────────────────────────
  saveAll() {
    try {
      const chObj = {};
      this.channels.forEach((msgs, id) => { if (msgs.length) chObj[id] = msgs.slice(-MAX_STORED); });
      writeJSON(CH_FILE,     chObj);
      writeJSON(USR_FILE,    this.users);
      writeJSON(FACTS_FILE,  this.facts);
      writeJSON(DIGEST_FILE, this.digests);
      writeJSON(STATS_FILE,  this.stats);
    } catch (e) {
      console.error("[Memory] Save error:", e.message);
    }
  }
}
