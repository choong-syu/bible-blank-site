const chromium = require("@sparticuz/chromium");
const { chromium: playwright } = require("playwright-core");

const SIJOSA_BASE = "https://www.sijosa.com/ch21/bible.php";
const VERSION_INDEX = "451";

module.exports = async function handler(req, res) {
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
    sendJson(res, 500, {
      error: `시조사 성경 페이지 수집에 실패했습니다: ${error.message}`
    });
  } finally {
    if (browser) await browser.close();
  }
};

function sendJson(res, status, payload) {
  res.statusCode = status;
  res.setHeader("content-type", "application/json; charset=utf-8");
  res.setHeader("cache-control", "no-store");
  res.end(JSON.stringify(payload));
}
