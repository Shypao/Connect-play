const http = require("http");
const fs = require("fs");
const path = require("path");
const bookingHandler = require("./api/customer-booking.js");

const root = __dirname;
const port = Number(process.env.PORT || 8088);
const mimeTypes = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
};

const server = http.createServer(async (req, res) => {
  if (req.url.startsWith("/api/customer-booking")) return bookingHandler(req, res);

  const requestPath = new URL(req.url, "http://localhost").pathname;
  const relativePath = requestPath === "/" ? "courtconnect.html" : decodeURIComponent(requestPath.slice(1));
  const filePath = path.resolve(root, relativePath);
  if (!filePath.startsWith(`${root}${path.sep}`) && filePath !== path.join(root, "courtconnect.html")) {
    res.writeHead(403).end("Forbidden");
    return;
  }
  fs.stat(filePath, (statError, stats) => {
    if (statError || !stats.isFile()) {
      res.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" }).end("Not found");
      return;
    }
    res.writeHead(200, { "Content-Type": mimeTypes[path.extname(filePath).toLowerCase()] || "application/octet-stream" });
    fs.createReadStream(filePath).pipe(res);
  });
});

server.listen(port, "127.0.0.1", () => {
  console.log(`Connect & Play is running at http://127.0.0.1:${port}`);
});
