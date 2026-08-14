require("dotenv").config();

const http = require("http");
const fs = require("fs");
const path = require("path");

const apiHandler = require("./api/index");

const PORT = process.env.PORT || 3000;
const PUBLIC_DIR = path.join(__dirname, "public");

function serveStatic(req, res) {
  let requestPath = req.url.split("?")[0];

  if (requestPath === "/") {
    requestPath = "/index.html";
  }

  const filePath = path.join(PUBLIC_DIR, requestPath);

  if (!filePath.startsWith(PUBLIC_DIR)) {
    res.writeHead(403);
    return res.end("Forbidden");
  }

  if (!fs.existsSync(filePath)) {
    res.writeHead(404);
    return res.end("Not found");
  }

  const extension = path.extname(filePath);

  const contentTypes = {
    ".html": "text/html; charset=utf-8",
    ".js": "application/javascript; charset=utf-8",
    ".css": "text/css; charset=utf-8",
    ".json": "application/json; charset=utf-8",
    ".svg": "image/svg+xml",
    ".png": "image/png",
    ".jpg": "image/jpeg",
    ".jpeg": "image/jpeg",
  };

  res.writeHead(200, {
    "Content-Type":
      contentTypes[extension] || "application/octet-stream",
  });

  fs.createReadStream(filePath).pipe(res);
}

const server = http.createServer(async (req, res) => {
  if (req.url.startsWith("/api/")) {
    return apiHandler(req, res);
  }

  return serveStatic(req, res);
});

server.listen(PORT, () => {
  console.log(
    `Peak Lead Platform running at http://localhost:${PORT}`
  );
});