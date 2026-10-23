/**
 * Black-Box Test Suite for VentureLift Platform
 * 
 * Tests the system strictly via its external HTTP API interface without knowledge
 * of internal implementation details. Validates HTTP contracts, status codes,
 * response payloads, boundary inputs, security restrictions, and error conditions.
 */

import assert from "node:assert/strict";
import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { extname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { routeApi, initBackend } from "../lib/backend.mjs";

const ROOT = fileURLToPath(new URL("../", import.meta.url));
const PORT = 8091;
const BASE_URL = `http://127.0.0.1:${PORT}`;

const contentTypes = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "application/javascript; charset=utf-8",
  ".png": "image/png",
};

async function routeStatic(response, pathname) {
  const requested = pathname === "/" ? "index.html" : pathname.slice(1);
  const filePath = resolve(join(ROOT, requested));
  if (!filePath.startsWith(ROOT) || !existsSync(filePath)) {
    response.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" });
    response.end("Not found");
    return;
  }
  const body = await readFile(filePath);
  response.writeHead(200, {
    "Content-Type": contentTypes[extname(filePath)] || "application/octet-stream",
    "Content-Length": body.length,
  });
  response.end(body);
}

const server = createServer(async (request, response) => {
  const url = new URL(request.url, `http://${request.headers.host}`);
  try {
    if (url.pathname.startsWith("/api/") && (await routeApi(request, response, url))) return;
    await routeStatic(response, url.pathname);
  } catch (error) {
    response.writeHead(500, { "Content-Type": "application/json; charset=utf-8" });
    response.end(JSON.stringify({ error: error.message }));
  }
});

let passedTests = 0;
let totalTests = 0;

async function runTest(testName, fn) {
  totalTests++;
  try {
    await fn();
    console.log(`  [PASS] ${testName}`);
    passedTests++;
  } catch (err) {
    console.error(`  [FAIL] ${testName}: ${err.message}`);
    throw err;
  }
}

// Minimal 1x1 test PNG in base64
const TEST_IMAGE_B64 = "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==";

async function main() {
  console.log("\n=======================================================");
  console.log("       STARTING BLACK-BOX FUNCTIONAL TEST SUITE");
  console.log("=======================================================\n");

  await initBackend();

  await new Promise((res) => {
    server.listen(PORT, "127.0.0.1", () => {
      console.log(`Test server running at ${BASE_URL}`);
      res();
    });
  });

  try {
    // 1. Static Web Asset Serving Tests
    await runTest("BlackBox 1.1: GET / serves HTML landing page with 200 OK", async () => {
      const res = await fetch(`${BASE_URL}/`);
      assert.equal(res.status, 200);
      assert.equal(res.headers.get("content-type"), "text/html; charset=utf-8");
      const text = await res.text();
      assert.equal(text.includes("VentureLift"), true);
      assert.equal(text.includes("Idea validation"), true);
    });

    await runTest("BlackBox 1.2: GET /styles.css serves valid stylesheet with 200 OK", async () => {
      const res = await fetch(`${BASE_URL}/styles.css`);
      assert.equal(res.status, 200);
      assert.equal(res.headers.get("content-type"), "text/css; charset=utf-8");
      const css = await res.text();
      assert.equal(css.includes(".venture-card"), true);
    });

    await runTest("BlackBox 1.3: GET /non-existent-page returns 404 Not Found", async () => {
      const res = await fetch(`${BASE_URL}/random_missing_route_xyz`);
      assert.equal(res.status, 404);
    });

    // 2. Authentication Contract & Security Tests
    await runTest("BlackBox 2.1: POST /api/register creates new account with 200 OK", async () => {
      const email = `test_bb_${Date.now()}@test.local`;
      const res = await fetch(`${BASE_URL}/api/register`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: "Blackbox User",
          email,
          password: "Password@123",
          role: "founder",
          expertise: "Autonomous Systems"
        })
      });
      assert.equal(res.status === 200 || res.status === 201, true);
      const data = await res.json();
      assert.equal(data.user.email, email);
      assert.equal(typeof data.user.id, "number");
    });

    await runTest("BlackBox 2.2: POST /api/register rejects missing required fields with 400", async () => {
      const res = await fetch(`${BASE_URL}/api/register`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: "Incomplete" })
      });
      assert.equal(res.status, 400);
      const data = await res.json();
      assert.equal(Boolean(data.error), true);
    });

    await runTest("BlackBox 2.3: POST /api/login rejects invalid credentials with 401", async () => {
      const res = await fetch(`${BASE_URL}/api/login`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email: "founder@venturelift.local",
          password: "WrongPassword!"
        })
      });
      assert.equal(res.status, 401);
    });

    let founderCookie = "";
    await runTest("BlackBox 2.4: POST /api/login succeeds with demo credentials and returns cookie", async () => {
      const res = await fetch(`${BASE_URL}/api/login`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email: "founder@venturelift.local",
          password: "Founder@123"
        })
      });
      assert.equal(res.status, 200);
      const setCookie = res.headers.get("set-cookie");
      assert.equal(Boolean(setCookie), true);
      assert.equal(setCookie.includes("vl_session="), true);
      founderCookie = setCookie.split(";")[0];
    });

    // 3. Protected Endpoint Authorization Boundaries
    await runTest("BlackBox 3.1: GET /api/me returns { user: null } when unauthenticated", async () => {
      const res = await fetch(`${BASE_URL}/api/me`);
      assert.equal(res.status, 200);
      const data = await res.json();
      assert.equal(data.user, null);
    });

    await runTest("BlackBox 3.2: GET /api/ventures rejects unauthenticated request with 401", async () => {
      const res = await fetch(`${BASE_URL}/api/ventures`);
      assert.equal(res.status, 401);
    });

    await runTest("BlackBox 3.3: GET /api/me succeeds with valid session cookie", async () => {
      const res = await fetch(`${BASE_URL}/api/me`, {
        headers: { Cookie: founderCookie }
      });
      assert.equal(res.status, 200);
      const data = await res.json();
      assert.equal(data.user.email, "founder@venturelift.local");
      assert.equal(data.user.role, "founder");
    });

    await runTest("BlackBox 3.4: GET /api/users rejects founder access with 403 Forbidden", async () => {
      const res = await fetch(`${BASE_URL}/api/users`, {
        headers: { Cookie: founderCookie }
      });
      assert.equal(res.status, 403);
    });

    // 4. AI & NLP Analysis Endpoints
    await runTest("BlackBox 4.1: POST /api/validate returns validation scores and feedback", async () => {
      const res = await fetch(`${BASE_URL}/api/validate`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Cookie: founderCookie },
        body: JSON.stringify({
          venture: {
            name: "EcoSolar Hub",
            founder: "Green Techie",
            sector: "CleanTech",
            stage: "Prototype",
            problem: "Grid outages leave remote communities with zero power.",
            solution: "Portable solar microgenerators with smart battery telemetry.",
            customer: "Off-grid homes and mobile clinics.",
            traction: "5 functional prototypes built.",
            goals: "Validate 90-day pilot."
          }
        })
      });
      assert.equal(res.status, 200);
      const data = await res.json();
      assert.equal(typeof data.result.score, "number");
      assert.equal(Array.isArray(data.result.strengths), true);
    });

    await runTest("BlackBox 4.2: POST /api/nlp rejects empty text with 400 Bad Request", async () => {
      const res = await fetch(`${BASE_URL}/api/nlp`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Cookie: founderCookie },
        body: JSON.stringify({ text: "" })
      });
      assert.equal(res.status, 400);
    });

    await runTest("BlackBox 4.3: POST /api/nlp analyzes valid pitch text with 200 OK", async () => {
      const res = await fetch(`${BASE_URL}/api/nlp`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Cookie: founderCookie },
        body: JSON.stringify({ text: "Our platform connects early customers to solar microgrids for clean energy." })
      });
      assert.equal(res.status, 200);
      const data = await res.json();
      assert.equal(typeof data.result.clarity_score, "number");
    });

    // 5. Roadmap Gating Boundary Test
    await runTest("BlackBox 5.1: POST /api/roadmap locks below threshold (score <= 75) with 403", async () => {
      const res = await fetch(`${BASE_URL}/api/roadmap`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Cookie: founderCookie },
        body: JSON.stringify({ score: 70, venture: { name: "Test" } })
      });
      assert.equal(res.status, 403);
    });

    await runTest("BlackBox 5.2: POST /api/roadmap unlocks above threshold (score > 75) with 200", async () => {
      const res = await fetch(`${BASE_URL}/api/roadmap`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Cookie: founderCookie },
        body: JSON.stringify({ score: 85, venture: { name: "Test High Score" } })
      });
      assert.equal(res.status, 200);
      const data = await res.json();
      assert.equal(typeof data.result.summary, "string");
      assert.equal(Array.isArray(data.result.weeks), true);
      assert.equal(data.result.weeks.length > 0, true);
    });


    console.log(`\nAll ${passedTests}/${totalTests} Black-Box functional tests passed successfully!\n`);
  } finally {
    server.close();
  }
}

main().catch((err) => {
  console.error("BlackBox suite failed:", err);
  process.exit(1);
});
