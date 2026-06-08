/**
 * Unit tests for pure utility functions exported from lib/backend.mjs.
 *
 * These cover JWT helpers, password hashing, encoding, local AI fallbacks,
 * JSON parsing, schema shapes, and other logic that previously had no tests.
 */
import assert from "node:assert/strict";
import { writeFileSync, mkdtempSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import test from "node:test";

import {
  base64UrlEncode,
  base64UrlDecode,
  createJwt,
  verifyJwt,
  hashPassword,
  verifyPassword,
  publicUser,
  nowIso,
  loadDotEnv,
  localValidation,
  localNlp,
  localFaq,
  localSuggestion,
  localRoadmap,
  parseJsonCandidate,
  extractAiJson,
  searchText,
  validationSchema,
  nlpSchema,
  faqSchema,
  suggestionSchema,
  roadmapSchema,
} from "../lib/backend.mjs";

// ── base64Url helpers ───────────────────────────────────────────────

test("base64UrlEncode / base64UrlDecode round-trip", () => {
  const original = JSON.stringify({ userId: 42, expiresAt: Date.now() });
  assert.equal(base64UrlDecode(base64UrlEncode(original)), original);
});

test("base64UrlEncode produces URL-safe characters", () => {
  const encoded = base64UrlEncode("subjects?v=3&extra=+/=");
  assert.ok(!encoded.includes("+"));
  assert.ok(!encoded.includes("/"));
  assert.ok(!encoded.includes("="));
});

// ── JWT helpers ─────────────────────────────────────────────────────

test("createJwt returns a two-part token", () => {
  const token = createJwt({ userId: 1, expiresAt: Date.now() + 60_000 });
  const parts = token.split(".");
  assert.equal(parts.length, 2);
});

test("verifyJwt accepts a valid non-expired token", () => {
  const payload = { userId: 7, expiresAt: Date.now() + 60_000 };
  const token = createJwt(payload);
  const verified = verifyJwt(token);
  assert.equal(verified.userId, 7);
});

test("verifyJwt rejects an expired token", () => {
  const token = createJwt({ userId: 7, expiresAt: Date.now() - 1 });
  assert.equal(verifyJwt(token), null);
});

test("verifyJwt rejects a tampered token", () => {
  const token = createJwt({ userId: 7, expiresAt: Date.now() + 60_000 });
  const tampered = token.slice(0, -1) + "X";
  assert.equal(verifyJwt(tampered), null);
});

test("verifyJwt returns null for null / empty / malformed input", () => {
  assert.equal(verifyJwt(null), null);
  assert.equal(verifyJwt(""), null);
  assert.equal(verifyJwt("no-dots-here"), null);
  assert.equal(verifyJwt("a.b.c"), null);
});

// ── Password hashing ────────────────────────────────────────────────

test("hashPassword produces salt:hash format", () => {
  const hashed = hashPassword("Secret123");
  assert.ok(hashed.includes(":"));
  const [salt, hash] = hashed.split(":");
  assert.ok(salt.length > 0);
  assert.ok(hash.length > 0);
});

test("verifyPassword returns true for the correct password", () => {
  const stored = hashPassword("CorrectHorse");
  assert.ok(verifyPassword("CorrectHorse", stored));
});

test("verifyPassword returns false for an incorrect password", () => {
  const stored = hashPassword("CorrectHorse");
  assert.ok(!verifyPassword("WrongPassword", stored));
});

test("verifyPassword handles malformed stored values", () => {
  assert.ok(!verifyPassword("any", "no-colon-here"));
  assert.ok(!verifyPassword("any", ""));
});

// ── publicUser ──────────────────────────────────────────────────────

test("publicUser strips password_hash and returns safe fields", () => {
  const user = {
    id: 1,
    name: "Alice",
    email: "alice@example.com",
    role: "founder",
    expertise: "AI",
    created_at: "2025-01-01",
    password_hash: "secret:hash",
  };
  const pub = publicUser(user);
  assert.equal(pub.id, 1);
  assert.equal(pub.email, "alice@example.com");
  assert.equal(pub.password_hash, undefined);
});

test("publicUser returns null for null input", () => {
  assert.equal(publicUser(null), null);
});

// ── nowIso ──────────────────────────────────────────────────────────

test("nowIso returns a valid ISO-8601 string", () => {
  const iso = nowIso();
  assert.ok(!isNaN(Date.parse(iso)));
  assert.ok(iso.endsWith("Z"));
});

// ── loadDotEnv ──────────────────────────────────────────────────────

test("loadDotEnv sets env vars from a .env file", () => {
  const dir = mkdtempSync(join(tmpdir(), "dotenv-"));
  const envFile = join(dir, ".env");
  writeFileSync(envFile, "VL_TEST_KEY=hello_world\n# comment\nVL_TEST_NUM=42\n");
  delete process.env.VL_TEST_KEY;
  delete process.env.VL_TEST_NUM;

  loadDotEnv(envFile);

  assert.equal(process.env.VL_TEST_KEY, "hello_world");
  assert.equal(process.env.VL_TEST_NUM, "42");

  delete process.env.VL_TEST_KEY;
  delete process.env.VL_TEST_NUM;
  rmSync(dir, { recursive: true, force: true });
});

test("loadDotEnv does not overwrite existing env vars", () => {
  const dir = mkdtempSync(join(tmpdir(), "dotenv-"));
  const envFile = join(dir, ".env");
  writeFileSync(envFile, "VL_EXISTING=new_value\n");
  process.env.VL_EXISTING = "original";

  loadDotEnv(envFile);

  assert.equal(process.env.VL_EXISTING, "original");

  delete process.env.VL_EXISTING;
  rmSync(dir, { recursive: true, force: true });
});

test("loadDotEnv silently ignores a missing file", () => {
  loadDotEnv("/tmp/definitely-does-not-exist-venturelift.env");
});

// ── localValidation ─────────────────────────────────────────────────

test("localValidation returns all required schema fields", () => {
  const venture = {
    problem: "Clinics lose follow-up patients because reminders are manual.",
    solution: "AI assistant that sends multilingual follow-up reminders.",
    traction: "Pilot with 3 clinics",
    customer: "Independent clinics",
  };
  const result = localValidation(venture);
  for (const key of ["score", "summary", "strengths", "risks", "experiments", "customer_segments", "pitch_improvements", "next_30_days"]) {
    assert.ok(key in result, `missing key: ${key}`);
  }
  assert.ok(typeof result.score === "number");
  assert.ok(result.score >= 35 && result.score <= 91);
});

test("localValidation gives higher score for longer problem+solution and real traction", () => {
  const weak = localValidation({ problem: "bad", solution: "fix", traction: "none", customer: "" });
  const strong = localValidation({
    problem: "Small clinics lose follow-up patients because reminders triage notes and care instructions are handled manually across paper logs.",
    solution: "An AI assistant summarizes visits sends multilingual follow-up reminders and flags high-risk patients for clinic staff automatically every day.",
    traction: "Pilot with 3 clinics and 420 patient reminders sent",
    customer: "Independent clinics",
  });
  assert.ok(strong.score > weak.score);
});

test("localValidation clamps score between 35 and 91", () => {
  const empty = localValidation({ problem: "", solution: "", traction: "", customer: "" });
  assert.ok(empty.score >= 35);
  assert.ok(empty.score <= 91);
});

// ── localNlp ────────────────────────────────────────────────────────

test("localNlp returns all required keys", () => {
  const result = localNlp("We help clinics automate follow-up reminders for patients using AI.");
  for (const key of ["keywords", "sentiment", "clarity_score", "market_signals", "missing_information", "improved_statement"]) {
    assert.ok(key in result, `missing key: ${key}`);
  }
  assert.ok(Array.isArray(result.keywords));
  assert.ok(typeof result.clarity_score === "number");
});

test("localNlp returns default keywords for very short input", () => {
  const result = localNlp("hi");
  assert.ok(result.keywords.length > 0);
});

test("localNlp clarity_score is between 45 and 88", () => {
  const result = localNlp("We help early-stage founders validate ideas and connect with mentors.");
  assert.ok(result.clarity_score >= 45);
  assert.ok(result.clarity_score <= 88);
});

// ── localFaq ────────────────────────────────────────────────────────

test("localFaq returns answer, next_steps, related_topics", () => {
  const result = localFaq("How do I find a mentor?");
  assert.ok(typeof result.answer === "string");
  assert.ok(Array.isArray(result.next_steps));
  assert.ok(Array.isArray(result.related_topics));
});

test("localFaq tailors answer to mentor keyword", () => {
  const result = localFaq("Can I search for a mentor on the platform?");
  assert.ok(result.answer.toLowerCase().includes("mentor"));
});

test("localFaq tailors answer to score/validation keyword", () => {
  const result = localFaq("What does the validation score mean?");
  assert.ok(result.answer.toLowerCase().includes("score") || result.answer.toLowerCase().includes("validation"));
});

test("localFaq tailors answer to admin keyword", () => {
  const result = localFaq("What can the admin do?");
  assert.ok(result.answer.toLowerCase().includes("admin"));
});

test("localFaq tailors answer to roadmap keyword", () => {
  const result = localFaq("How does the roadmap work?");
  assert.ok(result.answer.toLowerCase().includes("roadmap"));
});

// ── localSuggestion ─────────────────────────────────────────────────

test("localSuggestion returns required keys", () => {
  const result = localSuggestion("How should I prioritize features?", { name: "TestVenture" });
  for (const key of ["reply", "action_items", "risks_to_watch", "mentor_angle"]) {
    assert.ok(key in result, `missing key: ${key}`);
  }
  assert.ok(Array.isArray(result.action_items));
});

test("localSuggestion includes venture name in reply", () => {
  const result = localSuggestion("pricing", { name: "LedgerLite" });
  assert.ok(result.reply.includes("LedgerLite"));
});

test("localSuggestion handles missing venture gracefully", () => {
  const result = localSuggestion("general question", null);
  assert.ok(result.reply.includes("this venture"));
});

// ── localRoadmap ────────────────────────────────────────────────────

test("localRoadmap returns required keys", () => {
  const result = localRoadmap({ name: "CarePulse AI" }, 82);
  for (const key of ["summary", "weeks", "milestones", "metrics", "funding_readiness"]) {
    assert.ok(key in result, `missing key: ${key}`);
  }
  assert.ok(Array.isArray(result.weeks));
  assert.ok(result.weeks.length >= 3);
});

test("localRoadmap weeks have period, focus, tasks", () => {
  const result = localRoadmap({ name: "CarePulse AI" }, 85);
  for (const week of result.weeks) {
    assert.ok(typeof week.period === "string");
    assert.ok(typeof week.focus === "string");
    assert.ok(Array.isArray(week.tasks));
  }
});

test("localRoadmap includes the score in summary", () => {
  const result = localRoadmap({ name: "TestVenture" }, 90);
  assert.ok(result.summary.includes("90"));
});

// ── parseJsonCandidate ──────────────────────────────────────────────

test("parseJsonCandidate extracts JSON from surrounding text", () => {
  const raw = 'Here is the response: {"score": 75, "summary": "ok"} end';
  const parsed = parseJsonCandidate(raw);
  assert.equal(parsed.score, 75);
});

test("parseJsonCandidate handles clean JSON", () => {
  const parsed = parseJsonCandidate('{"a":1}');
  assert.equal(parsed.a, 1);
});

test("parseJsonCandidate throws on invalid JSON", () => {
  assert.throws(() => parseJsonCandidate("not json at all"), { name: "SyntaxError" });
});

// ── extractAiJson ───────────────────────────────────────────────────

test("extractAiJson extracts from standard chat completion format", () => {
  const data = { choices: [{ message: { content: '{"score": 80}' } }] };
  const result = extractAiJson(data);
  assert.equal(result.score, 80);
});

test("extractAiJson extracts from object content", () => {
  const data = { choices: [{ message: { content: { score: 80 } } }] };
  const result = extractAiJson(data);
  assert.equal(result.score, 80);
});

test("extractAiJson extracts from text completion format", () => {
  const data = { choices: [{ text: '{"score": 80}' }] };
  const result = extractAiJson(data);
  assert.equal(result.score, 80);
});

test("extractAiJson extracts from output array format", () => {
  const data = { output: [{ content: [{ text: '{"score": 80}' }] }] };
  const result = extractAiJson(data);
  assert.equal(result.score, 80);
});

test("extractAiJson throws on null data", () => {
  assert.throws(() => extractAiJson(null));
});

test("extractAiJson throws on empty choices", () => {
  assert.throws(() => extractAiJson({ choices: [{}] }));
});

// ── searchText ──────────────────────────────────────────────────────

test("searchText wraps value in LIKE wildcards", () => {
  assert.equal(searchText("hello"), "%hello%");
});

test("searchText lowercases and trims", () => {
  assert.equal(searchText("  Hello  "), "%hello%");
});

test("searchText handles empty/null input", () => {
  assert.equal(searchText(""), "%%");
  assert.equal(searchText(null), "%%");
  assert.equal(searchText(undefined), "%%");
});

// ── Schema shape validations ────────────────────────────────────────

test("validationSchema has all required fields", () => {
  const s = validationSchema();
  assert.ok(s.required.includes("score"));
  assert.ok(s.required.includes("summary"));
  assert.ok(s.required.includes("strengths"));
  assert.ok(s.required.includes("risks"));
  assert.ok(s.required.includes("experiments"));
  assert.ok(s.required.includes("customer_segments"));
  assert.ok(s.required.includes("pitch_improvements"));
  assert.ok(s.required.includes("next_30_days"));
});

test("nlpSchema has all required fields", () => {
  const s = nlpSchema();
  assert.ok(s.required.includes("keywords"));
  assert.ok(s.required.includes("sentiment"));
  assert.ok(s.required.includes("clarity_score"));
  assert.ok(s.required.includes("market_signals"));
  assert.ok(s.required.includes("missing_information"));
  assert.ok(s.required.includes("improved_statement"));
});

test("faqSchema has all required fields", () => {
  const s = faqSchema();
  assert.ok(s.required.includes("answer"));
  assert.ok(s.required.includes("next_steps"));
  assert.ok(s.required.includes("related_topics"));
});

test("suggestionSchema has all required fields", () => {
  const s = suggestionSchema();
  assert.ok(s.required.includes("reply"));
  assert.ok(s.required.includes("action_items"));
  assert.ok(s.required.includes("risks_to_watch"));
  assert.ok(s.required.includes("mentor_angle"));
});

test("roadmapSchema has all required fields", () => {
  const s = roadmapSchema();
  assert.ok(s.required.includes("summary"));
  assert.ok(s.required.includes("weeks"));
  assert.ok(s.required.includes("milestones"));
  assert.ok(s.required.includes("metrics"));
  assert.ok(s.required.includes("funding_readiness"));
});
