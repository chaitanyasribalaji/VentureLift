/**
 * Integration tests for VentureLift API routes.
 */
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { mkdtemp, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { fileURLToPath } from "node:url";
import test from "node:test";

const ROOT = fileURLToPath(new URL("..", import.meta.url));
const tempDir = await mkdtemp(join(tmpdir(), "venturelift-"));
const dbPath = join(tempDir, "test.db");

let serverProcess;
let baseUrl;

async function startServer() {
  serverProcess = spawn("node", ["server.mjs"], {
    cwd: ROOT,
    env: {
      ...process.env,
      PORT: "0",
      NODE_ENV: "test",
      DB_PATH: dbPath,
      JWT_SECRET: "test-secret",
      SUPABASE_URL: "",
      SUPABASE_KEY: "",
      OPENAI_API_KEY: "",
      GROQ_API_KEY: "",
    },
    stdio: ["ignore", "pipe", "pipe"],
  });

  const url = await new Promise((resolve, reject) => {
    const timeout = setTimeout(() => reject(new Error("Server did not start")), 15000);
    serverProcess.stdout.on("data", (chunk) => {
      const text = chunk.toString();
      const match = text.match(/http:\/\/127\.0\.0\.1:(\d+)/);
      if (match) {
        clearTimeout(timeout);
        resolve(`http://127.0.0.1:${match[1]}`);
      }
    });
    serverProcess.stderr.on("data", (chunk) => {
      process.stderr.write(chunk);
    });
    serverProcess.on("error", reject);
    serverProcess.on("exit", (code) => {
      if (code !== null && code !== 0) reject(new Error(`Server exited with code ${code}`));
    });
  });

  baseUrl = url;
}

async function api(path, options = {}) {
  const response = await fetch(`${baseUrl}${path}`, {
    ...options,
    headers: { "Content-Type": "application/json", ...(options.headers || {}) },
  });
  const text = await response.text();
  const data = text ? JSON.parse(text) : {};
  return { response, data };
}

test.before(async () => {
  await startServer();
});

test.after(async () => {
  if (serverProcess) serverProcess.kill();
  await rm(tempDir, { recursive: true, force: true });
});

test("login with demo founder account", async () => {
  const { response, data } = await api("/api/login", {
    method: "POST",
    body: JSON.stringify({ email: "founder@venturelift.local", password: "Founder@123" }),
  });
  assert.equal(response.status, 200);
  assert.equal(data.user.role, "founder");
});

test("authenticated ventures and validation flow", async () => {
  const login = await api("/api/login", {
    method: "POST",
    body: JSON.stringify({ email: "founder@venturelift.local", password: "Founder@123" }),
  });
  const cookie = login.response.headers.get("set-cookie");
  assert.ok(cookie);

  const me = await api("/api/me", { headers: { Cookie: cookie } });
  assert.equal(me.data.user.email, "founder@venturelift.local");

  const ventures = await api("/api/ventures", { headers: { Cookie: cookie } });
  assert.ok(ventures.data.ventures.length > 0);

  const validate = await api("/api/validate", {
    method: "POST",
    headers: { Cookie: cookie },
    body: JSON.stringify({ venture: ventures.data.ventures[0] }),
  });
  assert.equal(validate.response.status, 200);
  assert.ok(validate.data.result.score >= 0);
  assert.equal(validate.data.source, "local");
});

test("nlp analysis returns clarity score", async () => {
  const login = await api("/api/login", {
    method: "POST",
    body: JSON.stringify({ email: "mentor@venturelift.local", password: "Mentor@123" }),
  });
  const cookie = login.response.headers.get("set-cookie");

  const nlp = await api("/api/nlp", {
    method: "POST",
    headers: { Cookie: cookie },
    body: JSON.stringify({ text: "We help clinics automate follow-up reminders for patients." }),
  });
  assert.equal(nlp.response.status, 200);
  assert.ok(nlp.data.result.clarity_score);
  assert.ok(Array.isArray(nlp.data.result.keywords));
});

test("ai-status reports local mode without API keys", async () => {
  const { data } = await api("/api/ai-status");
  assert.equal(data.enabled, false);
  assert.equal(data.supabase_enabled, false);
});

// ── Registration ────────────────────────────────────────────────────

test("register a new founder account", async () => {
  const { response, data } = await api("/api/register", {
    method: "POST",
    body: JSON.stringify({
      name: "Test Founder",
      email: "test-register@venturelift.local",
      password: "TestPass123",
      role: "founder",
    }),
  });
  assert.equal(response.status, 201);
  assert.equal(data.user.role, "founder");
  assert.equal(data.user.email, "test-register@venturelift.local");
});

test("register rejects duplicate email", async () => {
  const { response } = await api("/api/register", {
    method: "POST",
    body: JSON.stringify({
      name: "Dupe Founder",
      email: "founder@venturelift.local",
      password: "DupePass123",
      role: "founder",
    }),
  });
  assert.equal(response.status, 409);
});

test("register rejects short password", async () => {
  const { response } = await api("/api/register", {
    method: "POST",
    body: JSON.stringify({
      name: "Bad Password",
      email: "badpw@venturelift.local",
      password: "12",
      role: "founder",
    }),
  });
  assert.equal(response.status, 400);
});

// ── Login failures ──────────────────────────────────────────────────

test("login fails with wrong password", async () => {
  const { response } = await api("/api/login", {
    method: "POST",
    body: JSON.stringify({ email: "founder@venturelift.local", password: "WrongPass" }),
  });
  assert.equal(response.status, 401);
});

test("login fails with non-existent email", async () => {
  const { response } = await api("/api/login", {
    method: "POST",
    body: JSON.stringify({ email: "nobody@venturelift.local", password: "NoPass123" }),
  });
  assert.equal(response.status, 401);
});

// ── Logout ──────────────────────────────────────────────────────────

test("logout clears session cookie", async () => {
  const login = await api("/api/login", {
    method: "POST",
    body: JSON.stringify({ email: "founder@venturelift.local", password: "Founder@123" }),
  });
  const cookie = login.response.headers.get("set-cookie");

  const logout = await api("/api/logout", {
    method: "POST",
    headers: { Cookie: cookie },
  });
  assert.equal(logout.response.status, 200);
  assert.equal(logout.data.ok, true);

  const clearCookie = logout.response.headers.get("set-cookie");
  assert.ok(clearCookie.includes("Max-Age=0"), "logout should set Max-Age=0 to clear cookie");
});

// ── /api/me without auth ────────────────────────────────────────────

test("me returns null user without auth", async () => {
  const { data } = await api("/api/me");
  assert.equal(data.user, null);
});

// ── Mentor listing ──────────────────────────────────────────────────

test("mentors endpoint returns mentors for founder", async () => {
  const login = await api("/api/login", {
    method: "POST",
    body: JSON.stringify({ email: "founder@venturelift.local", password: "Founder@123" }),
  });
  const cookie = login.response.headers.get("set-cookie");

  const { response, data } = await api("/api/mentors", { headers: { Cookie: cookie } });
  assert.equal(response.status, 200);
  assert.ok(Array.isArray(data.mentors));
  assert.ok(data.mentors.length > 0);
  assert.ok(data.mentors.every((m) => m.role === "mentor"));
});

test("mentors endpoint supports search query", async () => {
  const login = await api("/api/login", {
    method: "POST",
    body: JSON.stringify({ email: "founder@venturelift.local", password: "Founder@123" }),
  });
  const cookie = login.response.headers.get("set-cookie");

  const { data } = await api("/api/mentors?q=fintech", { headers: { Cookie: cookie } });
  assert.ok(Array.isArray(data.mentors));
  assert.ok(data.mentors.some((m) => m.expertise.toLowerCase().includes("fintech")));
});

test("mentors endpoint requires auth", async () => {
  const { response } = await api("/api/mentors");
  assert.equal(response.status, 401);
});

// ── Admin users ─────────────────────────────────────────────────────

test("admin can list all users", async () => {
  const login = await api("/api/login", {
    method: "POST",
    body: JSON.stringify({ email: "admin@venturelift.local", password: "Admin@123" }),
  });
  const cookie = login.response.headers.get("set-cookie");

  const { response, data } = await api("/api/users", { headers: { Cookie: cookie } });
  assert.equal(response.status, 200);
  assert.ok(Array.isArray(data.users));
  assert.ok(data.users.length >= 3);
});

test("non-admin cannot list users", async () => {
  const login = await api("/api/login", {
    method: "POST",
    body: JSON.stringify({ email: "founder@venturelift.local", password: "Founder@123" }),
  });
  const cookie = login.response.headers.get("set-cookie");

  const { response } = await api("/api/users", { headers: { Cookie: cookie } });
  assert.equal(response.status, 403);
});

// ── Venture creation ────────────────────────────────────────────────

test("founder can create a new venture", async () => {
  const login = await api("/api/login", {
    method: "POST",
    body: JSON.stringify({ email: "founder@venturelift.local", password: "Founder@123" }),
  });
  const cookie = login.response.headers.get("set-cookie");

  const { response, data } = await api("/api/ventures", {
    method: "POST",
    headers: { Cookie: cookie },
    body: JSON.stringify({
      name: "TestVenture",
      founder: "Test Founder",
      sector: "SaaS",
      stage: "Idea",
      problem: "Manual workflow tracking wastes time.",
      solution: "Automated dashboard for task tracking.",
      customer: "Small teams",
      traction: "5 user interviews",
      goals: "Launch MVP in 30 days",
    }),
  });
  assert.equal(response.status, 201);
  assert.equal(data.venture.name, "TestVenture");
});

test("venture creation rejects missing fields", async () => {
  const login = await api("/api/login", {
    method: "POST",
    body: JSON.stringify({ email: "founder@venturelift.local", password: "Founder@123" }),
  });
  const cookie = login.response.headers.get("set-cookie");

  const { response } = await api("/api/ventures", {
    method: "POST",
    headers: { Cookie: cookie },
    body: JSON.stringify({ name: "Incomplete" }),
  });
  assert.equal(response.status, 400);
});

// ── FAQ endpoint ────────────────────────────────────────────────────

test("faq endpoint returns answer for a question", async () => {
  const login = await api("/api/login", {
    method: "POST",
    body: JSON.stringify({ email: "founder@venturelift.local", password: "Founder@123" }),
  });
  const cookie = login.response.headers.get("set-cookie");

  const { response, data } = await api("/api/faq", {
    method: "POST",
    headers: { Cookie: cookie },
    body: JSON.stringify({ question: "What is VentureLift?" }),
  });
  assert.equal(response.status, 200);
  assert.ok(typeof data.result.answer === "string");
  assert.ok(Array.isArray(data.result.next_steps));
});

test("faq endpoint rejects empty question", async () => {
  const login = await api("/api/login", {
    method: "POST",
    body: JSON.stringify({ email: "founder@venturelift.local", password: "Founder@123" }),
  });
  const cookie = login.response.headers.get("set-cookie");

  const { response } = await api("/api/faq", {
    method: "POST",
    headers: { Cookie: cookie },
    body: JSON.stringify({ question: "" }),
  });
  assert.equal(response.status, 400);
});

// ── Suggestions endpoint ────────────────────────────────────────────

test("suggestions endpoint returns structured advice", async () => {
  const login = await api("/api/login", {
    method: "POST",
    body: JSON.stringify({ email: "founder@venturelift.local", password: "Founder@123" }),
  });
  const cookie = login.response.headers.get("set-cookie");

  const { response, data } = await api("/api/suggestions", {
    method: "POST",
    headers: { Cookie: cookie },
    body: JSON.stringify({ message: "How do I find product-market fit?" }),
  });
  assert.equal(response.status, 200);
  assert.ok(typeof data.result.reply === "string");
  assert.ok(Array.isArray(data.result.action_items));
  assert.ok(Array.isArray(data.result.risks_to_watch));
});

test("suggestions endpoint rejects empty message", async () => {
  const login = await api("/api/login", {
    method: "POST",
    body: JSON.stringify({ email: "founder@venturelift.local", password: "Founder@123" }),
  });
  const cookie = login.response.headers.get("set-cookie");

  const { response } = await api("/api/suggestions", {
    method: "POST",
    headers: { Cookie: cookie },
    body: JSON.stringify({ message: "" }),
  });
  assert.equal(response.status, 400);
});

// ── Roadmap endpoint ────────────────────────────────────────────────

test("roadmap endpoint returns plan for high-scoring venture", async () => {
  const login = await api("/api/login", {
    method: "POST",
    body: JSON.stringify({ email: "founder@venturelift.local", password: "Founder@123" }),
  });
  const cookie = login.response.headers.get("set-cookie");

  const { response, data } = await api("/api/roadmap", {
    method: "POST",
    headers: { Cookie: cookie },
    body: JSON.stringify({ score: 82, venture: { name: "CarePulse AI" } }),
  });
  assert.equal(response.status, 200);
  assert.ok(typeof data.result.summary === "string");
  assert.ok(Array.isArray(data.result.weeks));
  assert.ok(Array.isArray(data.result.milestones));
});

test("roadmap endpoint blocks low-scoring ventures", async () => {
  const login = await api("/api/login", {
    method: "POST",
    body: JSON.stringify({ email: "founder@venturelift.local", password: "Founder@123" }),
  });
  const cookie = login.response.headers.get("set-cookie");

  const { response } = await api("/api/roadmap", {
    method: "POST",
    headers: { Cookie: cookie },
    body: JSON.stringify({ score: 50 }),
  });
  assert.equal(response.status, 403);
});

// ── Reports endpoint ────────────────────────────────────────────────

test("admin can list reports", async () => {
  const login = await api("/api/login", {
    method: "POST",
    body: JSON.stringify({ email: "admin@venturelift.local", password: "Admin@123" }),
  });
  const cookie = login.response.headers.get("set-cookie");

  const { response, data } = await api("/api/reports", { headers: { Cookie: cookie } });
  assert.equal(response.status, 200);
  assert.ok(Array.isArray(data.reports));
});

test("founder cannot list reports", async () => {
  const login = await api("/api/login", {
    method: "POST",
    body: JSON.stringify({ email: "founder@venturelift.local", password: "Founder@123" }),
  });
  const cookie = login.response.headers.get("set-cookie");

  const { response } = await api("/api/reports", { headers: { Cookie: cookie } });
  assert.equal(response.status, 403);
});

// ── NLP error handling ──────────────────────────────────────────────

test("nlp endpoint rejects empty text", async () => {
  const login = await api("/api/login", {
    method: "POST",
    body: JSON.stringify({ email: "founder@venturelift.local", password: "Founder@123" }),
  });
  const cookie = login.response.headers.get("set-cookie");

  const { response } = await api("/api/nlp", {
    method: "POST",
    headers: { Cookie: cookie },
    body: JSON.stringify({ text: "" }),
  });
  assert.equal(response.status, 400);
});

// ── Static file serving ─────────────────────────────────────────────

test("serves index.html at root", async () => {
  const response = await fetch(`${baseUrl}/`);
  assert.equal(response.status, 200);
  const ct = response.headers.get("content-type");
  assert.ok(ct.includes("text/html"));
});

test("returns 404 for non-existent static file", async () => {
  const response = await fetch(`${baseUrl}/does-not-exist.html`);
  assert.equal(response.status, 404);
});
