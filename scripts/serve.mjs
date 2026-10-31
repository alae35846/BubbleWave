#!/usr/bin/env node
/**
 * Petit serveur statique pour BubbleWave.
 *
 * Aucune dépendance : `npm run dev` suffit pour ouvrir le site sur
 * http://127.0.0.1:4173/. Le dossier publié est `site/`.
 */

import { createServer } from "node:http";
import { readFile, stat } from "node:fs/promises";
import { extname, join, normalize, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(fileURLToPath(new URL("../site/", import.meta.url)));
const PORT = Number(process.env.PORT || 4173);
const HOST = process.env.HOST || "127.0.0.1";

const MIME_TYPES = {
  ".css": "text/css; charset=utf-8",
  ".gif": "image/gif",
  ".html": "text/html; charset=utf-8",
  ".ico": "image/x-icon",
  ".jpeg": "image/jpeg",
  ".jpg": "image/jpeg",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".mjs": "text/javascript; charset=utf-8",
  ".png": "image/png",
  ".svg": "image/svg+xml",
  ".txt": "text/plain; charset=utf-8",
  ".webmanifest": "application/manifest+json; charset=utf-8",
  ".webp": "image/webp",
  ".xml": "application/xml; charset=utf-8",
};

const server = createServer(async (request, response) => {
  const method = request.method || "GET";

  if (method !== "GET" && method !== "HEAD") {
    response.writeHead(405, { Allow: "GET, HEAD" });
    response.end("Méthode non autorisée");
    return;
  }

  let pathname;
  try {
    pathname = decodeURIComponent(new URL(request.url || "/", `http://${request.headers.host || HOST}`).pathname);
  } catch {
    response.writeHead(400, { "Content-Type": "text/plain; charset=utf-8" });
    response.end("URL invalide");
    return;
  }

  if (pathname.includes("\0")) {
    response.writeHead(400, { "Content-Type": "text/plain; charset=utf-8" });
    response.end("URL invalide");
    return;
  }

  const relative = normalize(pathname).replace(/^([/\\])+/, "");
  let filePath = resolve(join(ROOT, relative));

  if (filePath !== ROOT && !filePath.startsWith(ROOT + sep)) {
    response.writeHead(403, { "Content-Type": "text/plain; charset=utf-8" });
    response.end("Accès refusé");
    return;
  }

  try {
    const info = await stat(filePath);
    if (info.isDirectory()) {
      filePath = join(filePath, "index.html");
    }

    const body = await readFile(filePath);
    const headers = {
      "Content-Type": MIME_TYPES[extname(filePath).toLowerCase()] || "application/octet-stream",
      "Content-Length": body.byteLength,
      "Cache-Control": "no-store",
      "X-Content-Type-Options": "nosniff",
      "Referrer-Policy": "strict-origin-when-cross-origin",
    };

    response.writeHead(200, headers);
    response.end(method === "HEAD" ? undefined : body);
  } catch (error) {
    if (error?.code === "ENOENT" || error?.code === "ENOTDIR") {
      response.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" });
      response.end("Page introuvable");
      return;
    }

    console.error(error);
    response.writeHead(500, { "Content-Type": "text/plain; charset=utf-8" });
    response.end("Erreur interne du serveur");
  }
});

server.listen(PORT, HOST, () => {
  console.log(`BubbleWave : http://${HOST}:${PORT}/`);
  console.log("Ctrl+C pour arrêter.");
});

const shutdown = () => server.close(() => process.exit(0));
process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);
