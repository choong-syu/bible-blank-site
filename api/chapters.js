const fs = require("node:fs/promises");
const path = require("node:path");

const CHAPTER_STORE = path.join(process.cwd(), "public", "data", "chapters.json");

module.exports = async function handler(req, res) {
  if (req.method === "GET") {
    const store = await readChapterStore();
    const chapters = Object.values(store.chapters)
      .map(({ verses, ...meta }) => ({
        ...meta,
        verseCount: verses.length
      }))
      .sort((a, b) => new Date(b.savedAt) - new Date(a.savedAt));

    sendJson(res, 200, { chapters });
    return;
  }

  if (req.method === "POST") {
    sendJson(res, 501, {
      error: "Vercel 배포본은 파일 저장을 영구 지원하지 않습니다. Vercel Blob, KV, Supabase 같은 저장소 연결이 필요합니다."
    });
    return;
  }

  sendJson(res, 405, { error: "Method not allowed." });
};

async function readChapterStore() {
  try {
    const raw = await fs.readFile(CHAPTER_STORE, "utf8");
    const parsed = JSON.parse(raw);
    return parsed && parsed.chapters ? parsed : { chapters: {} };
  } catch {
    return { chapters: {} };
  }
}

function sendJson(res, status, payload) {
  res.statusCode = status;
  res.setHeader("content-type", "application/json; charset=utf-8");
  res.setHeader("cache-control", "no-store");
  res.end(JSON.stringify(payload));
}
