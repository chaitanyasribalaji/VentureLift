import { routeApi } from "../lib/backend.mjs";

export default async function handler(req, res) {
  let pathname = "";

  // 1. Check matched path headers from Vercel
  const matchedPath = req.headers?.["x-matched-path"] || req.headers?.["x-vercel-matched-path"];
  if (matchedPath && !matchedPath.includes("[...slug]")) {
    pathname = matchedPath.split("?")[0];
  }

  // 2. Check query.slug parameter
  if (!pathname || pathname === "/" || pathname.includes("[...slug]")) {
    const rawSlug = req.query?.slug;
    const slugParts = Array.isArray(rawSlug) ? rawSlug : rawSlug ? [rawSlug] : [];
    const joinedSlug = slugParts.filter(Boolean).join("/");
    if (joinedSlug) {
      pathname = joinedSlug.startsWith("api/") ? `/${joinedSlug}` : `/api/${joinedSlug}`;
    }
  }

  // 3. Check x-now-route-matches header (Vercel legacy rewrite capture)
  if (!pathname || pathname === "/" || pathname.includes("[...slug]")) {
    const routeMatches = req.headers?.["x-now-route-matches"];
    if (routeMatches) {
      try {
        const params = new URLSearchParams(routeMatches);
        const match = params.get("1") || params.get("slug");
        if (match) {
          pathname = match.startsWith("api/") ? `/${match}` : `/api/${match}`;
        }
      } catch {}
    }
  }

  // 4. Check req.url
  if (!pathname || pathname === "/" || pathname.includes("[...slug]")) {
    if (req.url) {
      try {
        const parsed = new URL(req.url, "http://localhost");
        const p = parsed.pathname;
        if (p && !p.includes("[...slug]")) {
          pathname = p;
        }
      } catch {
        const rawPath = (req.url || "").split("?")[0];
        if (rawPath && !rawPath.includes("[...slug]")) {
          pathname = rawPath;
        }
      }
    }
  }

  // 5. Normalization
  if (!pathname || pathname === "/" || pathname.includes("[...slug]")) {
    pathname = "/api";
  }

  if (!pathname.startsWith("/api/")) {
    if (pathname === "/api") {
      // noop
    } else {
      pathname = `/api${pathname.startsWith("/") ? pathname : `/${pathname}`}`;
    }
  }

  if (pathname.length > 5 && pathname.endsWith("/")) {
    pathname = pathname.slice(0, -1);
  }

  const search = req.url?.includes("?") ? req.url.slice(req.url.indexOf("?")) : "";
  const url = new URL(`${pathname}${search}`, "http://localhost");

  try {
    const handled = await routeApi(req, res, url);
    if (!handled) {
      res.statusCode = 404;
      res.setHeader("Content-Type", "application/json; charset=utf-8");
      res.end(JSON.stringify({ error: `Not found: ${pathname}` }));
    }
  } catch (error) {
    res.statusCode = 500;
    res.setHeader("Content-Type", "application/json; charset=utf-8");
    res.end(JSON.stringify({ error: error.message || "Internal Server Error" }));
  }
}
