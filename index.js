const fs = require("node:fs/promises");
const path = require("node:path");

const PUBLIC_ROOT = path.join(__dirname, "public");

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
    return loadHandler("./api/chapters")(req, res);
  }

  if (url.pathname === "/api/sijosa") {
    return loadHandler("./api/sijosa")(req, res);
  }

  return serveStatic(url.pathname, res);
};

function loadHandler(modulePath) {
  const mod = require(modulePath);
  const handler = typeof mod === "function" ? mod : mod.default || mod.handler;

  if (typeof handler !== "function") {
    throw new TypeError(`${modulePath} does not export a request handler.`);
  }

  return handler;
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
