const fs = require("node:fs/promises");
const path = require("node:path");
const { chromium } = require("playwright");

const ROOT = path.resolve(__dirname, "..");
const OUTPUT_FILE = path.join(ROOT, "public", "data", "chapters.json");
const SIJOSA_BASE = "https://www.sijosa.com/ch21/bible.php";
const VERSION_INDEX = "451";

const targets = process.argv.slice(2);

if (!targets.length) {
  console.error("Usage: npm run fetch:chapters -- Mark:14 John:3");
  process.exit(1);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});

async function main() {
  const store = await readStore();
  const browser = await chromium.launch({ headless: true });

  try {
    for (const target of targets) {
      const [rawCode, chapterText] = target.split(":");
      const code = rawCode.replaceAll("_", " ");
      const chapter = Number(chapterText);

      if (!code || !Number.isInteger(chapter) || chapter < 1) {
        throw new Error(`Invalid target: ${target}. Use Book:Chapter, e.g. Mark:14.`);
      }

      const result = await scrapeChapterWithRetry(browser, code, chapter);
      const key = `${code}:${chapter}`;
      store.chapters[key] = {
        ...result,
        key,
        savedAt: new Date().toISOString()
      };
      await writeStore(store);
      console.log(`Saved ${key}: ${result.verses.length} verses`);
    }
  } finally {
    await browser.close();
  }

  await writeStore(store);
}

async function scrapeChapterWithRetry(browser, code, chapter) {
  let lastError;
  for (let attempt = 1; attempt <= 3; attempt += 1) {
    try {
      return await scrapeChapter(browser, code, chapter);
    } catch (error) {
      lastError = error;
      console.warn(`Retry ${attempt}/3 failed for ${code}:${chapter}: ${error.message}`);
      await new Promise((resolve) => setTimeout(resolve, attempt * 1500));
    }
  }
  throw lastError;
}

async function scrapeChapter(browser, code, chapter) {
  const context = await browser.newContext({
    locale: "ko-KR",
    viewport: { width: 1366, height: 900 },
    userAgent:
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36"
  });

  await context.addInitScript(() => {
    Object.defineProperty(navigator, "webdriver", { get: () => undefined });
  });

  const page = await context.newPage();
  const url = new URL(SIJOSA_BASE);
  url.searchParams.set("book_idx", VERSION_INDEX);
  url.searchParams.set("code", code);
  url.searchParams.set("chapter", String(chapter));
  url.searchParams.set("book_idx2", "");

  try {
    await page.goto(url.toString(), { waitUntil: "domcontentloaded", timeout: 30000 });
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
      throw new Error(`No verses found for ${code}:${chapter}`);
    }

    return {
      source: "fixed-sijosa",
      title: data.title || `${code} ${chapter}`,
      code,
      chapter,
      verses: data.verses,
      fetchedAt: new Date().toISOString()
    };
  } finally {
    await context.close();
  }
}

async function readStore() {
  try {
    const raw = await fs.readFile(OUTPUT_FILE, "utf8");
    const parsed = JSON.parse(raw);
    return parsed && parsed.chapters ? parsed : { chapters: {} };
  } catch {
    return { chapters: {} };
  }
}

async function writeStore(store) {
  await fs.mkdir(path.dirname(OUTPUT_FILE), { recursive: true });
  await fs.writeFile(OUTPUT_FILE, `${JSON.stringify(store, null, 2)}\n`, "utf8");
}
