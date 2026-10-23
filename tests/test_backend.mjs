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
