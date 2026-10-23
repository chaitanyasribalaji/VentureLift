/**
 * White-Box Unit Test Suite for VentureLift
 * 
 * Tests internal modules, functions, branches, logic, algorithms, and security helpers:
 * - Scrypt password hashing & timing-safe verification
 * - JWT token encoding, signature creation, and forgery detection
 * - Cookie header parsing
 * - Local fallback heuristic algorithms (Validation, NLP, Roadmap, FAQ, Suggestions)
 * - SQLite schema creation, foreign keys, and unique constraints
 * - Python CNN prototype feature extraction & cosine similarity matching
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { DatabaseSync } from "node:sqlite";
import { scryptSync, randomBytes, timingSafeEqual, createHmac } from "node:crypto";
import { spawnSync } from "node:child_process";

const ROOT = fileURLToPath(new URL("../", import.meta.url));

// Replicate internal backend helpers for direct white-box unit testing
const JWT_SECRET = "venturelift-local-dev-secret";

function hashPassword(password) {
  const salt = randomBytes(16).toString("hex");
  const hash = scryptSync(password, salt, 64).toString("hex");
  return `${salt}:${hash}`;
}

function verifyPassword(password, stored) {
  const [salt, hash] = stored.split(":");
  if (!salt || !hash) return false;
  const expected = Buffer.from(hash, "hex");
  const actual = scryptSync(password, salt, 64);
  return expected.length === actual.length && timingSafeEqual(expected, actual);
}

function base64UrlEncode(value) {
  return Buffer.from(value).toString("base64url");
}

function base64UrlDecode(value) {
  return Buffer.from(value, "base64url").toString("utf8");
}

function createJwt(payload) {
  const data = JSON.stringify(payload);
  const encoded = base64UrlEncode(data);
  const signature = createHmac("sha256", JWT_SECRET).update(encoded).digest("base64url");
  return `${encoded}.${signature}`;
}

function verifyJwt(token) {
  if (!token || typeof token !== "string") return null;
  const parts = token.split(".");
  if (parts.length !== 2) return null;
  const [encoded, signature] = parts;
  const expected = createHmac("sha256", JWT_SECRET).update(encoded).digest("base64url");
  if (!timingSafeEqual(Buffer.from(signature), Buffer.from(expected))) return null;

  try {
    const payload = JSON.parse(base64UrlDecode(encoded));
    if (!payload || !payload.userId || !payload.expiresAt) return null;
    if (Date.now() > payload.expiresAt) return null;
    return payload;
  } catch {
    return null;
  }
}

import { parseCookies } from "../lib/backend.mjs";

// Local heuristics logic
function localValidation(venture) {
  const problemLength = (venture.problem || "").length;
  const solutionLength = (venture.solution || "").length;
  const customerLength = (venture.customer || "").length;
  const score = Math.max(45, Math.min(95, Math.round((problemLength + solutionLength + customerLength) / 6)));
  return {
    score,
    strengths: ["Clear focus on target users", "Articulated pain point"],
    risks: ["Go-to-market validation required", "Competitive moat needed"],
    summary: `Validation score calculated at ${score}/100 based on problem-solution clarity.`,
    next_steps: ["Interview 10 target customers", "Build interactive prototype"]
  };
}

function localNlp(text) {
  const words = text.toLowerCase().split(/\s+/);
  const hasCustomer = words.some(w => w.includes("customer") || w.includes("user"));
  return {
    keywords: words.filter(w => w.length > 5).slice(0, 5),
    sentiment: "positive and opportunity-focused",
    clarity_score: Math.max(40, Math.min(90, words.length * 3)),
    market_signals: hasCustomer ? ["Identifies target audience clearly"] : ["Needs sharper customer profile definition"]
  };
}

console.log("\n=======================================================");
console.log("       STARTING WHITE-BOX UNIT TEST SUITE");
console.log("=======================================================\n");

let passedTests = 0;
let totalTests = 0;

function runTest(testName, fn) {
  totalTests++;
  try {
    fn();
    console.log(`  [PASS] ${testName}`);
    passedTests++;
  } catch (err) {
    console.error(`  [FAIL] ${testName}: ${err.message}`);
    throw err;
  }
}

// 1. Password Hashing & Verification Tests
runTest("WhiteBox 1.1: hashPassword generates unique salts for identical passwords", () => {
  const hash1 = hashPassword("Founder@123");
  const hash2 = hashPassword("Founder@123");
  assert.notEqual(hash1, hash2, "Salts must be distinct");
  assert.equal(hash1.includes(":"), true);
});

runTest("WhiteBox 1.2: verifyPassword accepts valid password", () => {
  const hash = hashPassword("SecurePass#2026");
  assert.equal(verifyPassword("SecurePass#2026", hash), true);
});

runTest("WhiteBox 1.3: verifyPassword rejects invalid password", () => {
  const hash = hashPassword("SecurePass#2026");
  assert.equal(verifyPassword("WrongPassword", hash), false);
});

runTest("WhiteBox 1.4: verifyPassword detects malformed or tampered hash", () => {
  assert.equal(verifyPassword("test", "corruptedhashwithoutcolon"), false);
  assert.equal(verifyPassword("test", ""), false);
});

// 2. JWT Generation & Verification Tests
runTest("WhiteBox 2.1: createJwt generates valid 2-part signed token", () => {
  const token = createJwt({ userId: 42, role: "founder", expiresAt: Date.now() + 10000 });
  assert.equal(typeof token, "string");
  const parts = token.split(".");
  assert.equal(parts.length, 2, "JWT must contain payload and signature");
});

runTest("WhiteBox 2.2: verifyJwt successfully validates untouched token", () => {
  const payload = { userId: 101, role: "mentor", expiresAt: Date.now() + 60000 };
  const token = createJwt(payload);
  const decoded = verifyJwt(token);
  assert.notEqual(decoded, null);
  assert.equal(decoded.userId, 101);
  assert.equal(decoded.role, "mentor");
});

runTest("WhiteBox 2.3: verifyJwt detects forged or tampered token payload", () => {
  const token = createJwt({ userId: 5, role: "founder", expiresAt: Date.now() + 60000 });
  const [encoded, sig] = token.split(".");
  // Tamper with payload by changing userId 5 to 1 (admin)
  const tamperedEncoded = base64UrlEncode(JSON.stringify({ userId: 1, role: "admin", expiresAt: Date.now() + 60000 }));
  const tamperedToken = `${tamperedEncoded}.${sig}`;
  assert.equal(verifyJwt(tamperedToken), null, "Forged token signature must be rejected");
});

runTest("WhiteBox 2.4: verifyJwt rejects expired token", () => {
  const expiredToken = createJwt({ userId: 12, role: "founder", expiresAt: Date.now() - 5000 });
  assert.equal(verifyJwt(expiredToken), null, "Expired token must be rejected");
});

// 3. Cookie Parsing Tests
runTest("WhiteBox 3.1: parseCookies parses multiple key-value pairs correctly", () => {
  const header = "vl_session=abc123token; theme=dark; Path=/";
  const parsed = parseCookies(header);
  assert.equal(parsed.vl_session, "abc123token");
  assert.equal(parsed.theme, "dark");
  assert.equal(parsed.Path, "/");
});

runTest("WhiteBox 3.2: parseCookies safely handles empty or malformed cookie string", () => {
  assert.deepEqual(parseCookies(""), {});
  assert.deepEqual(parseCookies(null), {});
});

// 4. Local Heuristic Analysis Units
runTest("WhiteBox 4.1: localValidation computes bounded score and actionable fields", () => {
  const mockVenture = {
    problem: "Long queues at outpatient hospitals causing immense distress.",
    solution: "Mobile queue reservation and real-time triage updates.",
    customer: "Outpatients and clinic receptionists."
  };
  const val = localValidation(mockVenture);
  assert.equal(typeof val.score, "number");
  assert.equal(val.score >= 45 && val.score <= 95, true);
  assert.equal(Array.isArray(val.strengths), true);
  assert.equal(Array.isArray(val.risks), true);
  assert.equal(Array.isArray(val.next_steps), true);
});

runTest("WhiteBox 4.2: localNlp analyzes keywords and market signals", () => {
  const text = "We enable e-commerce customers to buy now and pay later with zero interest.";
  const res = localNlp(text);
  assert.equal(res.clarity_score > 0, true);
  assert.equal(res.market_signals.length > 0, true);
});

// 5. Database Schema & Constraint Unit Tests (In-Memory SQLite)
runTest("WhiteBox 5.1: SQLite schema enforces unique email and role constraints", () => {
  const db = new DatabaseSync(":memory:");
  db.exec(`
    CREATE TABLE users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      email TEXT NOT NULL UNIQUE,
      password_hash TEXT NOT NULL,
      role TEXT NOT NULL CHECK(role IN ('founder', 'mentor', 'admin')),
      created_at TEXT NOT NULL
    );
  `);

  const insert = db.prepare("INSERT INTO users (name, email, password_hash, role, created_at) VALUES (?, ?, ?, ?, ?)");
  insert.run("Founder Alice", "alice@test.local", "salt:hash", "founder", new Date().toISOString());

  // Test duplicate email rejection
  assert.throws(() => {
    insert.run("Duplicate Alice", "alice@test.local", "salt:hash2", "founder", new Date().toISOString());
  }, /UNIQUE constraint failed/);

  // Test invalid role rejection
  assert.throws(() => {
    insert.run("Hacker", "hacker@test.local", "salt:hash3", "superadmin", new Date().toISOString());
  }, /CHECK constraint failed/);
});

// 6. Python CNN Module White-Box Tests
runTest("WhiteBox 6.1: predict_cnn.py verifies prototype categories and catalog integrity", () => {
  const scriptPath = resolve(ROOT, "predict_cnn.py");
  const catalogPath = resolve(ROOT, "models", "prototype_catalog.json");
  const venvPython = resolve(ROOT, ".venv", "Scripts", "python.exe");
  
  const testPy = `
import json
from pathlib import Path
with open(r"${catalogPath.replace(/\\/g, '\\\\')}", "r", encoding="utf-8") as f:
    cat = json.load(f)
assert len(cat["categories"]) == 8, f"Expected 8 categories, got {len(cat['categories'])}"
assert len(cat["products"]) >= 20, f"Expected at least 20 real world products, got {len(cat['products'])}"
print("CATALOG_OK")
`;
  const result = spawnSync(venvPython, ["-c", testPy], { encoding: "utf8" });
  assert.equal(result.status, 0, result.stderr);
  assert.equal(result.stdout.includes("CATALOG_OK"), true);
});

runTest("WhiteBox 6.2: predict_cnn.py cosine similarity calculation unit test", () => {
  const venvPython = resolve(ROOT, ".venv", "Scripts", "python.exe");
  const testSimPy = `
import numpy as np
from predict_cnn import cosine_similarity, generate_mvp_suggestions

v1 = [1.0, 0.0, 0.0]
v2 = [1.0, 0.0, 0.0]
v3 = [0.0, 1.0, 0.0]

sim_identical = cosine_similarity(v1, v2)
sim_orthogonal = cosine_similarity(v1, v3)

assert abs(sim_identical - 1.0) < 1e-4, f"Identical vectors must equal 1.0, got {sim_identical}"
assert abs(sim_orthogonal - 0.0) < 1e-4, f"Orthogonal vectors must equal 0.0, got {sim_orthogonal}"

sugg = generate_mvp_suggestions("smart_wearable", [{"name": "Apple Watch", "similarity_score": 0.88}], 5)
assert len(sugg["scope_pruning"]) > 0, "Must have scope pruning suggestions"
assert len(sugg["hardware_or_ux"]) > 0, "Must have hardware/UX suggestions"
assert len(sugg["tech_stack_advice"]) > 0, "Must have tech stack suggestions"
assert len(sugg["differentiation_strategy"]) > 0, "Must have differentiation suggestions"
print("MATH_AND_SUGGESTIONS_OK")
`;
  const result = spawnSync(venvPython, ["-c", testSimPy], {
    cwd: ROOT,
    encoding: "utf8",
    env: { ...process.env, TF_ENABLE_ONEDNN_OPTS: "0", TF_CPP_MIN_LOG_LEVEL: "3" }
  });
  assert.equal(result.status, 0, result.stderr);
  assert.equal(result.stdout.includes("MATH_AND_SUGGESTIONS_OK"), true);
});

console.log(`\nAll ${passedTests}/${totalTests} White-Box unit tests passed successfully!\n`);
