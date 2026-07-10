const http = require("node:http");
const fs = require("node:fs/promises");
const path = require("node:path");
const { URL } = require("node:url");
const { chromium } = require("playwright");

const PORT = Number(process.env.PORT || 5174);
const HOST = process.env.HOST || "127.0.0.1";
const ROOT = path.resolve(__dirname, "..");
const PUBLIC_ROOT = path.join(ROOT, "public");
const DATA_DIR = path.join(ROOT, "data");
const CHAPTER_STORE = path.join(DATA_DIR, "chapters.json");
const SIJOSA_BASE = "https://www.sijosa.com/ch21/bible.php";
const VERSION_INDEX = "451";
const cache = new Map();

const chromeCandidates = [
  process.env.CHROME_PATH,
  "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
  "C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe",
  "C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe",
  "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe"
].filter(Boolean);

const mimeTypes = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".md": "text/markdown; charset=utf-8",
  ".svg": "image/svg+xml"
};

let browserPromise;

const server = http.createServer(async (req, res) => {
  try {
    const url = new URL(req.url, `http://${req.headers.host}`);
    if (url.pathname === "/api/sijosa") {
      await handleSijosaApi(url, res);
      return;
    }

    if (url.pathname === "/api/chapters") {
      await handleChaptersApi(req, res);
      return;
    }

    await serveStatic(url, res);
  } catch (error) {
    sendJson(res, 500, { error: error.message });
  }
});

server.listen(PORT, HOST, () => {
  console.log(`Bible blank site: http://${HOST}:${PORT}/`);
});

process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);

async function handleSijosaApi(url, res) {
  const code = url.searchParams.get("code") || "Mark";
  const chapter = Number(url.searchParams.get("chapter") || 14);

  if (!/^[1-3]? ?[A-Za-z]+(?: [A-Za-z]+)*$/.test(code)) {
    sendJson(res, 400, { error: "Invalid book code." });
    return;
  }

  if (!Number.isInteger(chapter) || chapter < 1 || chapter > 150) {
    sendJson(res, 400, { error: "Invalid chapter." });
    return;
  }

  const cacheKey = `${code}:${chapter}`;
  if (cache.has(cacheKey)) {
    sendJson(res, 200, { ...cache.get(cacheKey), cached: true });
    return;
  }

  const stored = await getStoredChapter(cacheKey);
  if (stored) {
    cache.set(cacheKey, stored);
    sendJson(res, 200, { ...stored, cached: true, stored: true });
    return;
  }

  const result = await scrapeSijosaChapter(code, chapter);
  cache.set(cacheKey, result);
  await upsertStoredChapter(result);
  sendJson(res, 200, result);
}

async function handleChaptersApi(req, res) {
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
    const body = await readJsonBody(req);
    if (!body || !body.code || !Number.isInteger(Number(body.chapter)) || !Array.isArray(body.verses)) {
      sendJson(res, 400, { error: "Invalid chapter payload." });
      return;
    }

    const result = {
      source: body.source || "manual",
      title: body.title || `${body.code} ${body.chapter}`,
      code: body.code,
      chapter: Number(body.chapter),
      verses: body.verses
        .map((item) => ({ verse: Number(item.verse), text: String(item.text || "").trim() }))
        .filter((item) => Number.isFinite(item.verse) && item.text),
      fetchedAt: body.fetchedAt || new Date().toISOString()
    };

    if (!result.verses.length) {
      sendJson(res, 400, { error: "No verses to save." });
      return;
    }

    await upsertStoredChapter(result);
    cache.set(`${result.code}:${result.chapter}`, result);
    sendJson(res, 200, { ok: true, chapter: result });
    return;
  }

  sendJson(res, 405, { error: "Method not allowed." });
}

async function scrapeSijosaChapter(code, chapter) {
  const browser = await getBrowser();
  const context = await browser.newContext({
    locale: "ko-KR",
    viewport: { width: 1366, height: 900 },
    userAgent:
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/149.0.0.0 Safari/537.36"
  });

  await context.addInitScript(() => {
    Object.defineProperty(navigator, "webdriver", { get: () => undefined });
  });

  const page = await context.newPage();
  const target = new URL(SIJOSA_BASE);
  target.searchParams.set("book_idx", VERSION_INDEX);
  target.searchParams.set("code", code);
  target.searchParams.set("chapter", String(chapter));
  target.searchParams.set("book_idx2", "");

  try {
    await page.goto(target.toString(), { waitUntil: "domcontentloaded", timeout: 30000 });
    await page.waitForSelector(".sentence_txt", { timeout: 20000 });

    const data = await page.evaluate(() => {
      const title = document.querySelector(".selectBible")?.textContent?.trim() || document.title;
      const verses = [...document.querySelectorAll(".sentence_txt")]
        .map((node) => ({
          verse: Number(node.dataset.verse),
          text: node.textContent.trim()
        }))
        .filter((item) => Number.isFinite(item.verse) && item.text);

      return { title, verses };
    });

    if (!data.verses.length) {
      throw new Error("Sijosa page loaded, but no verses were found.");
    }

    return {
      source: "sijosa",
      title: data.title,
      code,
      chapter,
      verses: data.verses,
      fetchedAt: new Date().toISOString()
    };
  } finally {
    await context.close();
  }
}

async function getStoredChapter(key) {
  const store = await readChapterStore();
  return store.chapters[key] || null;
}

async function upsertStoredChapter(chapter) {
  const key = `${chapter.code}:${chapter.chapter}`;
  const store = await readChapterStore();
  store.chapters[key] = {
    ...chapter,
    key,
    savedAt: new Date().toISOString()
  };
  await fs.mkdir(DATA_DIR, { recursive: true });
  await fs.writeFile(CHAPTER_STORE, `${JSON.stringify(store, null, 2)}\n`, "utf8");
}

async function readChapterStore() {
  try {
    const raw = await fs.readFile(CHAPTER_STORE, "utf8");
    const parsed = JSON.parse(raw);
    return parsed && parsed.chapters ? parsed : { chapters: {} };
  } catch {
    return { chapters: {} };
  }
}

async function readJsonBody(req) {
  const chunks = [];
  for await (const chunk of req) chunks.push(chunk);
  if (!chunks.length) return null;
  return JSON.parse(Buffer.concat(chunks).toString("utf8"));
}

async function getBrowser() {
  if (!browserPromise) {
    browserPromise = (async () => {
      const executablePath = await findChrome();
      return chromium.launch({
        headless: process.env.SIJOSA_HEADFUL !== "1",
        executablePath,
        args: ["--disable-blink-features=AutomationControlled"]
      });
    })();
  }
  return browserPromise;
}

async function findChrome() {
  for (const candidate of chromeCandidates) {
    try {
      await fs.access(candidate);
      return candidate;
    } catch {
      // Try the next browser path.
    }
  }
  return undefined;
}

async function serveStatic(url, res) {
  const requested = decodeURIComponent(url.pathname);
  const relativePath = requested === "/" ? "index.html" : requested.replace(/^\/+/, "");
  const filePath = path.resolve(PUBLIC_ROOT, relativePath);

  if (!filePath.startsWith(PUBLIC_ROOT)) {
    res.writeHead(403);
    res.end("Forbidden");
    return;
  }

  try {
    const body = await fs.readFile(filePath);
    const type = mimeTypes[path.extname(filePath)] || "application/octet-stream";
    res.writeHead(200, { "content-type": type });
    res.end(body);
  } catch {
    res.writeHead(404, { "content-type": "text/plain; charset=utf-8" });
    res.end("Not found");
  }
}

function sendJson(res, status, payload) {
  res.writeHead(status, {
    "content-type": "application/json; charset=utf-8",
    "cache-control": "no-store"
  });
  res.end(JSON.stringify(payload));
}

async function shutdown() {
  if (browserPromise) {
    try {
      const browser = await browserPromise;
      await browser.close();
    } catch {
      // Ignore shutdown errors.
    }
  }
  process.exit(0);
}
