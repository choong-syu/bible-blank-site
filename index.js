const fs = require("node:fs/promises");
const path = require("node:path");

const PUBLIC_ROOT = path.join(__dirname, "public");
const CHAPTER_STORE = path.join(__dirname, "data", "chapters.json");
const SIJOSA_BASE = "https://www.sijosa.com/ch21/bible.php";
const VERSION_INDEX = "451";

const mimeTypes = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml"
};

module.exports = async function handler(req, res) {
  const url = new URL(req.url, `https://${req.headers.host || "localhost"}`);
  req.query = Object.fromEntries(url.searchParams.entries());

  if (url.pathname === "/api/chapters") {
    return handleChapters(req, res);
  }

  if (url.pathname === "/api/sijosa") {
    return handleSijosa(req, res);
  }

  return serveStatic(url.pathname, res);
};

async function handleChapters(req, res) {
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
      error: "Vercel deployment does not provide durable file storage. Connect Vercel Blob, KV, or a database to save new chapters globally."
    });
    return;
  }

  sendJson(res, 405, { error: "Method not allowed." });
}

async function handleSijosa(req, res) {
  const code = String(req.query.code || "Mark");
  const chapter = Number(req.query.chapter || 14);

  if (!/^[1-3]? ?[A-Za-z]+(?: [A-Za-z]+)*$/.test(code)) {
    sendJson(res, 400, { error: "Invalid book code." });
    return;
  }

  if (!Number.isInteger(chapter) || chapter < 1 || chapter > 150) {
    sendJson(res, 400, { error: "Invalid chapter." });
    return;
  }

  let browser;
  try {
    const chromium = require("@sparticuz/chromium");
    const { chromium: playwright } = require("playwright-core");

    browser = await playwright.launch({
      args: chromium.args,
      executablePath: await chromium.executablePath(),
      headless: true
    });

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

    sendJson(res, 200, {
      source: "sijosa",
      title: data.title,
      code,
      chapter,
      verses: data.verses,
      fetchedAt: new Date().toISOString()
    });
  } catch (error) {
    sendJson(res, 500, { error: `Failed to scrape Sijosa Bible page: ${error.message}` });
  } finally {
    if (browser) await browser.close();
  }
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

async function serveStatic(pathname, res) {
  const requested = decodeURIComponent(pathname);
  const relativePath = requested === "/" ? "index.html" : requested.replace(/^\/+/, "");
  const filePath = path.resolve(PUBLIC_ROOT, relativePath);

  if (!filePath.startsWith(PUBLIC_ROOT)) {
    res.statusCode = 403;
    res.end("Forbidden");
    return;
  }

  try {
    const body = await fs.readFile(filePath);
    res.statusCode = 200;
    res.setHeader("content-type", mimeTypes[path.extname(filePath)] || "application/octet-stream");
    res.end(body);
  } catch {
    res.statusCode = 404;
    res.setHeader("content-type", "text/plain; charset=utf-8");
    res.end("Not found");
  }
}

function sendJson(res, status, payload) {
  res.statusCode = status;
  res.setHeader("content-type", "application/json; charset=utf-8");
  res.setHeader("cache-control", "no-store");
  res.end(JSON.stringify(payload));
}
