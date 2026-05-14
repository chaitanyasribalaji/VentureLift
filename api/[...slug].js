import { routeApi } from "../lib/backend.mjs";

export default async function handler(req, res) {
  const slug = Array.isArray(req.query.slug) ? req.query.slug : req.query.slug ? [req.query.slug] : [];
  const pathname = `/${slug.join("/")}`;
  const search = req.url?.includes("?") ? req.url.slice(req.url.indexOf("?")) : "";
  const url = new URL(`${pathname}${search}`, "http://localhost");

  try {
    const handled = await routeApi(req, res, url);
    if (!handled) {
      res.statusCode = 404;
      res.setHeader("Content-Type", "application/json; charset=utf-8");
      res.end(JSON.stringify({ error: "Not found" }));
    }
  } catch (error) {
    res.statusCode = 500;
    res.setHeader("Content-Type", "application/json; charset=utf-8");
    res.end(JSON.stringify({ error: error.message || "Internal Server Error" }));
  }
}
