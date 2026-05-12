import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { existsSync, readFileSync } from "node:fs";
import { extname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { DatabaseSync } from "node:sqlite";
import { randomBytes, scryptSync, timingSafeEqual } from "node:crypto";

const ROOT = fileURLToPath(new URL(".", import.meta.url));
const PUBLIC = resolve(ROOT, "public");
const DB_PATH = resolve(ROOT, "venture_platform.db");

function loadDotEnv(path) {
  if (!existsSync(path)) return;
  const text = readFileSync(path, "utf8");
  for (const line of text.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const index = trimmed.indexOf("=");
    if (index === -1) continue;
    const key = trimmed.slice(0, index).trim();
    const value = trimmed.slice(index + 1).trim();
    if (!process.env[key]) process.env[key] = value;
  }
}

loadDotEnv(resolve(ROOT, ".env"));

const OPENAI_API_KEY = process.env.OPENAI_API_KEY || process.env.ADVANCED_AI_API_KEY;
const GROQ_API_KEY = process.env.GROQ_API_KEY;
const AI_PROVIDER = OPENAI_API_KEY ? "openai" : GROQ_API_KEY ? "groq" : null;
const AI_MODEL = process.env.AI_MODEL || (AI_PROVIDER === "groq" ? "llama3-8b-8192" : "gpt-5.4-mini");
const PORT = Number(process.env.PORT || 8000);

const database = new DatabaseSync(DB_PATH);

database.exec(`
  CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    email TEXT NOT NULL UNIQUE,
    password_hash TEXT NOT NULL,
    role TEXT NOT NULL CHECK(role IN ('founder', 'mentor', 'admin')),
    expertise TEXT NOT NULL DEFAULT '',
    created_at TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS sessions (
    token TEXT PRIMARY KEY,
    user_id INTEGER NOT NULL,
    created_at TEXT NOT NULL,
    expires_at TEXT NOT NULL,
    FOREIGN KEY (user_id) REFERENCES users(id)
  );

  CREATE TABLE IF NOT EXISTS ventures (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER,
    name TEXT NOT NULL,
    founder TEXT NOT NULL,
    sector TEXT NOT NULL,
    stage TEXT NOT NULL,
    problem TEXT NOT NULL,
    solution TEXT NOT NULL,
    customer TEXT NOT NULL,
    traction TEXT NOT NULL,
    goals TEXT NOT NULL,
    created_at TEXT NOT NULL,
    FOREIGN KEY (user_id) REFERENCES users(id)
  );

  CREATE TABLE IF NOT EXISTS ai_reports (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    venture_id INTEGER,
    report_type TEXT NOT NULL,
    payload TEXT NOT NULL,
    created_at TEXT NOT NULL,
    FOREIGN KEY (venture_id) REFERENCES ventures(id)
  );
`);

try {
  database.exec("ALTER TABLE ventures ADD COLUMN user_id INTEGER");
} catch {
  // Existing databases already have this column.
}

const contentTypes = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "application/javascript; charset=utf-8",
  ".png": "image/png",
};

function nowIso() {
  return new Date().toISOString();
}

function sendJson(response, status, payload) {
  const body = JSON.stringify(payload, null, 2);
  response.writeHead(status, {
    "Content-Type": "application/json; charset=utf-8",
    "Content-Length": Buffer.byteLength(body),
  });
  response.end(body);
}

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

function publicUser(user) {
  if (!user) return null;
  return {
    id: user.id,
    name: user.name,
    email: user.email,
    role: user.role,
    expertise: user.expertise,
    created_at: user.created_at,
  };
}

function seedUser({ name, email, password, role, expertise = "" }) {
  const existing = database.prepare("SELECT id FROM users WHERE email = ?").get(email);
  if (existing) {
    database.prepare("UPDATE users SET name = ?, role = ?, expertise = ? WHERE email = ?").run(name, role, expertise, email);
    return existing.id;
  }
  const result = database
    .prepare("INSERT INTO users (name, email, password_hash, role, expertise, created_at) VALUES (?, ?, ?, ?, ?, ?)")
    .run(name, email, hashPassword(password), role, expertise, nowIso());
  return result.lastInsertRowid;
}

function seedVenture(userId, venture) {
  const existing = database.prepare("SELECT id FROM ventures WHERE name = ?").get(venture.name);
  if (existing) return;
  database
    .prepare(
      `
      INSERT INTO ventures
      (user_id, name, founder, sector, stage, problem, solution, customer, traction, goals, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `,
    )
    .run(
      userId,
      venture.name,
      venture.founder,
      venture.sector,
      venture.stage,
      venture.problem,
      venture.solution,
      venture.customer,
      venture.traction,
      venture.goals,
      nowIso(),
    );
}

function seedInitialUsers() {
  seedUser({
    name: "Platform Admin",
    email: "admin@venturelift.local",
    password: "Admin@123",
    role: "admin",
    expertise: "Platform operations",
  });
  seedUser({
    name: "Mentor Demo",
    email: "mentor@venturelift.local",
    password: "Mentor@123",
    role: "mentor",
    expertise: "Product strategy, fundraising, GTM",
  });
  const founderId = seedUser({
    name: "Founder Demo",
    email: "founder@venturelift.local",
    password: "Founder@123",
    role: "founder",
    expertise: "Early-stage venture building",
  });

  seedUser({
    name: "Ananya Rao",
    email: "ananya.rao@venturelift.local",
    password: "Mentor@123",
    role: "mentor",
    expertise: "Healthtech, clinical pilots, hospital partnerships, regulatory strategy",
  });
  seedUser({
    name: "Marcus Bennett",
    email: "marcus.bennett@venturelift.local",
    password: "Mentor@123",
    role: "mentor",
    expertise: "Fintech, payments, pricing, B2B SaaS sales, investor readiness",
  });
  seedUser({
    name: "Leah Mensah",
    email: "leah.mensah@venturelift.local",
    password: "Mentor@123",
    role: "mentor",
    expertise: "Climate tech, circular economy, impact metrics, grant applications",
  });
  seedUser({
    name: "David Chen",
    email: "david.chen@venturelift.local",
    password: "Mentor@123",
    role: "mentor",
    expertise: "AI products, NLP, data platforms, MVP architecture, product analytics",
  });
  seedUser({
    name: "Priya Kapoor",
    email: "priya.kapoor@venturelift.local",
    password: "Mentor@123",
    role: "mentor",
    expertise: "Edtech, learning design, university incubators, community growth",
  });

  const ventures = [
    {
      name: "CarePulse AI",
      founder: "Neha Sharma",
      sector: "Healthtech",
      stage: "MVP",
      problem: "Small clinics lose follow-up patients because reminders, triage notes, and care instructions are handled manually.",
      solution: "An AI assistant that summarizes visits, sends multilingual follow-up reminders, and flags high-risk patients for clinic staff.",
      customer: "Independent clinics and outpatient care centers",
      traction: "Pilot with 3 clinics and 420 patient reminders sent",
      goals: "Convert two pilots into paid monthly subscriptions",
    },
    {
      name: "LedgerLite",
      founder: "Arjun Mehta",
      sector: "Fintech",
      stage: "Prototype",
      problem: "Micro retailers struggle to track cash flow, credit sales, and supplier dues in one simple system.",
      solution: "A mobile-first bookkeeping and credit reminder app with invoice capture, WhatsApp nudges, and weekly cash-flow summaries.",
      customer: "Small grocery stores, local distributors, and solo retailers",
      traction: "85 retailer interviews and 19 prototype testers",
      goals: "Launch paid beta with 50 shops in one city",
    },
    {
      name: "ReLoop Materials",
      founder: "Maya Iyer",
      sector: "Climate tech",
      stage: "Pilot",
      problem: "Restaurants and cafes generate packaging waste but lack a reliable reverse logistics partner for reusable containers.",
      solution: "A reusable packaging network with QR tracking, deposit payments, and scheduled pickup from partner restaurants.",
      customer: "Urban cafes, cloud kitchens, and eco-conscious food brands",
      traction: "Pilot with 12 restaurants and 8,700 container rotations",
      goals: "Secure grant funding and expand to 50 restaurant partners",
    },
    {
      name: "SkillBridge Campus",
      founder: "Riya Nair",
      sector: "Edtech",
      stage: "Revenue",
      problem: "College students complete courses but lack mentor feedback, startup exposure, and proof of practical skills.",
      solution: "A project-based learning platform that matches students with mentors, live venture briefs, and portfolio reviews.",
      customer: "Universities, entrepreneurship cells, and final-year students",
      traction: "Paid programs at 2 colleges with 310 learners",
      goals: "Build mentor marketplace and sign 5 more campuses",
    },
    {
      name: "FarmRoute",
      founder: "Karan Patel",
      sector: "Supply chain",
      stage: "Idea",
      problem: "Small farmers lose margin because produce aggregation, transport pricing, and buyer discovery are fragmented.",
      solution: "A logistics coordination tool that groups nearby harvests, compares transport bids, and connects farmers to verified buyers.",
      customer: "Farmer producer organizations and rural aggregators",
      traction: "Discovery calls with 6 FPOs and 4 transport operators",
      goals: "Run a manual pilot for one crop season",
    },
  ];

  for (const venture of ventures) seedVenture(founderId, venture);
}

seedInitialUsers();

function parseCookies(request) {
  const header = request.headers.cookie || "";
  return Object.fromEntries(
    header
      .split(";")
      .map((part) => part.trim())
      .filter(Boolean)
      .map((part) => {
        const index = part.indexOf("=");
        return [part.slice(0, index), decodeURIComponent(part.slice(index + 1))];
      }),
  );
}

function getCurrentUser(request) {
  const token = parseCookies(request).vl_session;
  if (!token) return null;
  const row = database
    .prepare(
      `
      SELECT users.*
      FROM sessions
      JOIN users ON users.id = sessions.user_id
      WHERE sessions.token = ? AND sessions.expires_at > ?
    `,
    )
    .get(token, nowIso());
  return row || null;
}

function requireUser(request, response) {
  const user = getCurrentUser(request);
  if (!user) {
    sendJson(response, 401, { error: "Login required" });
    return null;
  }
  return user;
}

function requireRole(request, response, roles) {
  const user = requireUser(request, response);
  if (!user) return null;
  if (!roles.includes(user.role)) {
    sendJson(response, 403, { error: "You do not have permission for this action." });
    return null;
  }
  return user;
}

function setSessionCookie(response, token, expiresAt) {
  response.setHeader(
    "Set-Cookie",
    `vl_session=${encodeURIComponent(token)}; HttpOnly; SameSite=Lax; Path=/; Expires=${new Date(expiresAt).toUTCString()}`,
  );
}

function clearSessionCookie(response) {
  response.setHeader("Set-Cookie", "vl_session=; HttpOnly; SameSite=Lax; Path=/; Max-Age=0");
}

async function readJson(request) {
  const chunks = [];
  for await (const chunk of request) chunks.push(chunk);
  if (!chunks.length) return {};
  return JSON.parse(Buffer.concat(chunks).toString("utf8"));
}

function validationPrompt(venture) {
  return `
You are an expert startup venture analyst for early-stage founders.
Return only strict JSON with these keys:
score, summary, strengths, risks, experiments, customer_segments, pitch_improvements, next_30_days.

Venture:
Name: ${venture.name || ""}
Sector: ${venture.sector || ""}
Stage: ${venture.stage || ""}
Problem: ${venture.problem || ""}
Solution: ${venture.solution || ""}
Customer: ${venture.customer || ""}
Traction: ${venture.traction || ""}
Goals: ${venture.goals || ""}
`;
}

function nlpPrompt(text) {
  return `
Analyze this startup description using NLP-style business interpretation.
Return only strict JSON with these keys:
keywords, sentiment, clarity_score, market_signals, missing_information, improved_statement.

Text:
${text}
`;
}

function faqPrompt(question) {
  return `
You are the VentureLift FAQ bot for an entrepreneurial support platform.
Answer the question clearly for founders, mentors, or admins.
Return only strict JSON with these keys:
answer, next_steps, related_topics.

Question:
${question}
`;
}

function suggestionPrompt(message, venture) {
  return `
You are a practical startup mentor. Give concise suggestions for the founder.
Return only strict JSON with these keys:
reply, action_items, risks_to_watch, mentor_angle.

Venture context:
Name: ${venture?.name || ""}
Sector: ${venture?.sector || ""}
Stage: ${venture?.stage || ""}
Problem: ${venture?.problem || ""}
Solution: ${venture?.solution || ""}
Customer: ${venture?.customer || ""}
Traction: ${venture?.traction || ""}
Goals: ${venture?.goals || ""}

Founder message:
${message}
`;
}

function roadmapPrompt(venture, score) {
  return `
You are generating a 90-day venture roadmap. The roadmap is allowed because validation score is above 75.
Return only strict JSON with these keys:
summary, weeks, milestones, metrics, funding_readiness.

Each item in weeks must include: period, focus, tasks.

Venture:
Name: ${venture?.name || ""}
Sector: ${venture?.sector || ""}
Stage: ${venture?.stage || ""}
Problem: ${venture?.problem || ""}
Solution: ${venture?.solution || ""}
Customer: ${venture?.customer || ""}
Traction: ${venture?.traction || ""}
Goals: ${venture?.goals || ""}
Validation score: ${score}
`;
}

function validationSchema() {
  return {
    type: "object",
    properties: {
      score: { type: "integer" },
      summary: { type: "string" },
      strengths: { type: "array", items: { type: "string" } },
      risks: { type: "array", items: { type: "string" } },
      experiments: { type: "array", items: { type: "string" } },
      customer_segments: { type: "array", items: { type: "string" } },
      pitch_improvements: { type: "array", items: { type: "string" } },
      next_30_days: { type: "array", items: { type: "string" } },
    },
    required: [
      "score",
      "summary",
      "strengths",
      "risks",
      "experiments",
      "customer_segments",
      "pitch_improvements",
      "next_30_days",
    ],
  };
}

function nlpSchema() {
  return {
    type: "object",
    properties: {
      keywords: { type: "array", items: { type: "string" } },
      sentiment: { type: "string" },
      clarity_score: { type: "integer" },
      market_signals: { type: "array", items: { type: "string" } },
      missing_information: { type: "array", items: { type: "string" } },
      improved_statement: { type: "string" },
    },
    required: ["keywords", "sentiment", "clarity_score", "market_signals", "missing_information", "improved_statement"],
  };
}

function faqSchema() {
  return {
    type: "object",
    properties: {
      answer: { type: "string" },
      next_steps: { type: "array", items: { type: "string" } },
      related_topics: { type: "array", items: { type: "string" } },
    },
    required: ["answer", "next_steps", "related_topics"],
  };
}

function suggestionSchema() {
  return {
    type: "object",
    properties: {
      reply: { type: "string" },
      action_items: { type: "array", items: { type: "string" } },
      risks_to_watch: { type: "array", items: { type: "string" } },
      mentor_angle: { type: "string" },
    },
    required: ["reply", "action_items", "risks_to_watch", "mentor_angle"],
  };
}

function roadmapSchema() {
  return {
    type: "object",
    properties: {
      summary: { type: "string" },
      weeks: {
        type: "array",
        items: {
          type: "object",
          properties: {
            period: { type: "string" },
            focus: { type: "string" },
            tasks: { type: "array", items: { type: "string" } },
          },
          required: ["period", "focus", "tasks"],
        },
      },
      milestones: { type: "array", items: { type: "string" } },
      metrics: { type: "array", items: { type: "string" } },
      funding_readiness: { type: "array", items: { type: "string" } },
    },
    required: ["summary", "weeks", "milestones", "metrics", "funding_readiness"],
  };
}

function parseJsonCandidate(text) {
  const trimmed = String(text || "").trim();
  const start = trimmed.indexOf("{");
  const end = trimmed.lastIndexOf("}");
  const payload = start !== -1 && end !== -1 ? trimmed.slice(start, end + 1) : trimmed;
  return JSON.parse(payload);
}

function extractAiJson(data) {
  if (!data) throw new Error("No AI response data");
  const message = data.choices?.[0]?.message;
  if (message) {
    if (typeof message.content === "string") return parseJsonCandidate(message.content);
    if (typeof message.content === "object" && message.content !== null) return message.content;
  }
  const text = data.choices?.[0]?.text || data.output?.[0]?.content?.[0]?.text;
  if (typeof text === "string") return parseJsonCandidate(text);
  throw new Error("Unable to parse AI JSON response");
}

async function callAiJson(prompt, schema) {
  if (!AI_PROVIDER) return null;

  const apiKey = OPENAI_API_KEY || GROQ_API_KEY;
  const headers = {
    Authorization: `Bearer ${apiKey}`,
    "Content-Type": "application/json",
  };

  const body = {
    model: AI_MODEL,
    messages: [{ role: "user", content: prompt }],
  };

  if (schema) {
    body.response_format = {
      type: "json_schema",
      json_schema: schema,
    };
  }

  const baseUrl = AI_PROVIDER === "groq" ? "https://api.groq.com" : "https://api.openai.com";
  const url = `${baseUrl}/v1/chat/completions`;

  const response = await fetch(url, {
    method: "POST",
    headers,
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    throw new Error(`${AI_PROVIDER} API returned ${response.status}: ${await response.text()}`);
  }

  const data = await response.json();
  return extractAiJson(data);
}

function localValidation(venture) {
  const problemWords = String(venture.problem || "").split(/\s+/).filter(Boolean).length;
  const solutionWords = String(venture.solution || "").split(/\s+/).filter(Boolean).length;
  const traction = String(venture.traction || "").trim().toLowerCase();
  let score = 52;
  score += Math.floor(Math.min(problemWords, 40) / 3);
  score += Math.floor(Math.min(solutionWords, 45) / 4);
  score += traction && !["none", "no"].includes(traction) ? 12 : 0;
  score = Math.max(35, Math.min(score, 91));

  return {
    score,
    summary: "Local AI fallback analysis. Add an API key to activate model-based validation.",
    strengths: [
      "The venture has a named customer and problem area.",
      "The solution can be shaped into a testable early product.",
      "The founder has enough context to define first experiments.",
    ],
    risks: [
      "Customer pain intensity needs stronger evidence.",
      "The value proposition may need a narrower first user segment.",
      "Business model and acquisition channels need validation.",
    ],
    experiments: [
      "Interview 12 target users and score urgency of the problem.",
      "Create a landing page with one offer and measure signup intent.",
      "Run a concierge prototype before building the full product.",
    ],
    customer_segments: [
      venture.customer || "Early adopters with urgent workflow pain",
      "Incubators and entrepreneurship cells",
      "Small teams seeking structured venture support",
    ],
    pitch_improvements: [
      "Quantify the problem with a clear cost, time, or revenue metric.",
      "Describe the first wedge market before expanding the platform vision.",
      "Add proof from interviews, pilots, waitlists, or usage data.",
    ],
    next_30_days: [
      "Finish 12 discovery interviews.",
      "Build a clickable MVP flow.",
      "Collect 3 mentor reviews and revise the pitch.",
    ],
  };
}

function localNlp(text) {
  const frequency = {};
  for (const word of text.split(/\s+/)) {
    const cleaned = word.replace(/[.,;:!?()[\]{}]/g, "").toLowerCase();
    if (cleaned.length > 4) frequency[cleaned] = (frequency[cleaned] || 0) + 1;
  }
  const keywords = Object.keys(frequency).sort((a, b) => frequency[b] - frequency[a]).slice(0, 8);
  const clarityScore = Math.max(45, Math.min(88, 95 - Math.abs(55 - text.split(/\s+/).filter(Boolean).length)));

  return {
    keywords: keywords.length ? keywords : ["startup", "customer", "innovation"],
    sentiment: "constructive and opportunity-focused",
    clarity_score: clarityScore,
    market_signals: [
      "The description points toward entrepreneurship enablement.",
      "There is room to define the highest-value first customer.",
    ],
    missing_information: [
      "Revenue model",
      "Primary acquisition channel",
      "Evidence from users",
    ],
    improved_statement:
      "We help early-stage founders validate ideas, connect with mentors, and move from concept to investor-ready venture through data-backed workflows and AI guidance.",
  };
}

function localFaq(question) {
  const lower = question.toLowerCase();
  let answer = "VentureLift helps founders create venture profiles, validate ideas, search mentors, analyze pitch text, and track startup readiness.";
  if (lower.includes("mentor")) {
    answer = "Founders can open Search to find mentors by expertise such as AI, fundraising, healthtech, product, fintech, edtech, or climate.";
  } else if (lower.includes("score") || lower.includes("validation")) {
    answer = "The validation score estimates idea readiness from problem clarity, customer definition, solution detail, traction, and next goals.";
  } else if (lower.includes("admin")) {
    answer = "Admin users can view platform users, review roles, and see venture activity across the platform.";
  } else if (lower.includes("roadmap")) {
    answer = "The roadmap generator unlocks after a venture receives a validation score above 75, then creates a 90-day execution plan.";
  }
  return {
    answer,
    next_steps: [
      "Create or select a venture profile.",
      "Run AI idea validation.",
      "Use Search to find mentors or review ventures.",
    ],
    related_topics: ["idea validation", "mentor matching", "roadmap", "funding readiness"],
  };
}

function localSuggestion(message, venture) {
  return {
    reply: `For ${venture?.name || "this venture"}, focus the next decision on evidence, not features. ${message ? "Your question points to a useful next experiment." : "Start with the riskiest assumption."}`,
    action_items: [
      "Write the top 3 assumptions that must be true for the venture to work.",
      "Interview 8 to 12 target customers and ask about current behavior, not opinions.",
      "Define one measurable success signal for the next two weeks.",
    ],
    risks_to_watch: [
      "Building too broadly before a narrow early user is proven.",
      "Counting interest as traction without a commitment signal.",
      "Ignoring acquisition cost and repeat usage.",
    ],
    mentor_angle: "Ask a mentor to review your customer segment, validation experiment, and pricing hypothesis.",
  };
}

function localRoadmap(venture, score) {
  return {
    summary: `${venture?.name || "The venture"} is ready for a focused 90-day roadmap because the validation score is ${score}. The priority is to convert validation into repeatable traction.`,
    weeks: [
      {
        period: "Weeks 1-2",
        focus: "Customer proof",
        tasks: [
          "Interview 12 target customers in the highest urgency segment.",
          "Document pain intensity, current alternatives, and willingness to pay.",
          "Rewrite the value proposition using customer language.",
        ],
      },
      {
        period: "Weeks 3-6",
        focus: "MVP and pilot",
        tasks: [
          "Build or refine the smallest workflow that proves the core promise.",
          "Recruit 5 pilot users and define usage checkpoints.",
          "Track activation, repeated use, and conversion intent.",
        ],
      },
      {
        period: "Weeks 7-10",
        focus: "Go-to-market",
        tasks: [
          "Test two acquisition channels with clear cost and conversion tracking.",
          "Create a landing page, demo script, and customer proof deck.",
          "Collect testimonials, case notes, or usage metrics.",
        ],
      },
      {
        period: "Weeks 11-12",
        focus: "Investor and mentor readiness",
        tasks: [
          "Prepare a 10-slide pitch deck with problem, traction, market, model, and ask.",
          "Review metrics with mentors and identify the next funding path.",
          "Set the next 90-day target based on pilot outcomes.",
        ],
      },
    ],
    milestones: [
      "12 customer interviews completed",
      "5 active pilot users",
      "One clear acquisition channel tested",
      "Pitch deck and mentor review completed",
    ],
    metrics: ["activation rate", "weekly active users", "pilot conversion", "customer acquisition cost", "retention signal"],
    funding_readiness: [
      "Show customer proof before asking for capital.",
      "Include pilot metrics and a precise use of funds.",
      "Prepare grant, incubator, or angel outreach depending on traction.",
    ],
  };
}

function saveReport(ventureId, reportType, payload) {
  database
    .prepare("INSERT INTO ai_reports (venture_id, report_type, payload, created_at) VALUES (?, ?, ?, ?)")
    .run(ventureId || null, reportType, JSON.stringify(payload), nowIso());
}

function searchText(value) {
  return `%${String(value || "").trim().toLowerCase()}%`;
}

async function routeApi(request, response, url) {
  const pathname = url.pathname;
  const query = url.searchParams.get("q") || "";

  if (request.method === "GET" && pathname === "/api/me") {
    sendJson(response, 200, { user: publicUser(getCurrentUser(request)) });
    return true;
  }

  if (request.method === "POST" && pathname === "/api/login") {
    const payload = await readJson(request);
    const email = String(payload.email || "").trim().toLowerCase();
    const password = String(payload.password || "");
    const user = database.prepare("SELECT * FROM users WHERE email = ?").get(email);
    if (!user || !verifyPassword(password, user.password_hash)) {
      sendJson(response, 401, { error: "Invalid email or password" });
      return true;
    }

    const token = randomBytes(32).toString("hex");
    const expiresAt = new Date(Date.now() + 1000 * 60 * 60 * 24 * 7).toISOString();
    database.prepare("INSERT INTO sessions (token, user_id, created_at, expires_at) VALUES (?, ?, ?, ?)").run(
      token,
      user.id,
      nowIso(),
      expiresAt,
    );
    setSessionCookie(response, token, expiresAt);
    sendJson(response, 200, { user: publicUser(user) });
    return true;
  }

  if (request.method === "POST" && pathname === "/api/register") {
    const payload = await readJson(request);
    const name = String(payload.name || "").trim();
    const email = String(payload.email || "").trim().toLowerCase();
    const password = String(payload.password || "");
    const role = ["founder", "mentor"].includes(payload.role) ? payload.role : "founder";
    const expertise = String(payload.expertise || "").trim();
    if (!name || !email || password.length < 6) {
      sendJson(response, 400, { error: "Name, email, and a 6+ character password are required." });
      return true;
    }
    try {
      const result = database
        .prepare("INSERT INTO users (name, email, password_hash, role, expertise, created_at) VALUES (?, ?, ?, ?, ?, ?)")
        .run(name, email, hashPassword(password), role, expertise, nowIso());
      const user = database.prepare("SELECT * FROM users WHERE id = ?").get(result.lastInsertRowid);
      sendJson(response, 201, { user: publicUser(user) });
    } catch {
      sendJson(response, 409, { error: "An account with this email already exists." });
    }
    return true;
  }

  if (request.method === "POST" && pathname === "/api/logout") {
    const token = parseCookies(request).vl_session;
    if (token) database.prepare("DELETE FROM sessions WHERE token = ?").run(token);
    clearSessionCookie(response);
    sendJson(response, 200, { ok: true });
    return true;
  }

  if (request.method === "GET" && pathname === "/api/users") {
    const user = requireRole(request, response, ["admin"]);
    if (!user) return true;
    const users = database.prepare("SELECT id, name, email, role, expertise, created_at FROM users ORDER BY role, name").all();
    sendJson(response, 200, { users });
    return true;
  }

  if (request.method === "GET" && pathname === "/api/mentors") {
    const user = requireRole(request, response, ["founder", "admin"]);
    if (!user) return true;
    const like = searchText(query);
    const mentors = database
      .prepare(
        `
        SELECT id, name, email, role, expertise, created_at
        FROM users
        WHERE role = 'mentor'
          AND (
            lower(name) LIKE ?
            OR lower(email) LIKE ?
            OR lower(expertise) LIKE ?
          )
        ORDER BY name
      `,
      )
      .all(like, like, like);
    sendJson(response, 200, { mentors });
    return true;
  }

  if (request.method === "GET" && pathname === "/api/ventures") {
    const user = requireUser(request, response);
    if (!user) return true;
    const like = searchText(query);
    const ventures =
      user.role === "founder"
        ? database
            .prepare(
              `
              SELECT *
              FROM ventures
              WHERE user_id = ?
                AND (
                  lower(name) LIKE ?
                  OR lower(founder) LIKE ?
                  OR lower(sector) LIKE ?
                  OR lower(stage) LIKE ?
                  OR lower(problem) LIKE ?
                  OR lower(solution) LIKE ?
                  OR lower(customer) LIKE ?
                )
              ORDER BY id DESC
            `,
            )
            .all(user.id, like, like, like, like, like, like, like)
        : database
            .prepare(
              `
              SELECT ventures.*, users.name AS owner_name, users.email AS owner_email
              FROM ventures
              LEFT JOIN users ON users.id = ventures.user_id
              WHERE lower(ventures.name) LIKE ?
                OR lower(ventures.founder) LIKE ?
                OR lower(ventures.sector) LIKE ?
                OR lower(ventures.stage) LIKE ?
                OR lower(ventures.problem) LIKE ?
                OR lower(ventures.solution) LIKE ?
                OR lower(ventures.customer) LIKE ?
                OR lower(users.name) LIKE ?
                OR lower(users.email) LIKE ?
              ORDER BY ventures.id DESC
            `,
            )
            .all(like, like, like, like, like, like, like, like, like);
    sendJson(response, 200, { ventures });
    return true;
  }

  if (request.method === "GET" && pathname === "/api/reports") {
    const user = requireRole(request, response, ["admin", "mentor"]);
    if (!user) return true;
    const reports = database.prepare("SELECT * FROM ai_reports ORDER BY id DESC LIMIT 20").all();
    sendJson(response, 200, {
      reports: reports.map((report) => ({ ...report, payload: JSON.parse(report.payload) })),
    });
    return true;
  }

  if (request.method === "POST" && pathname === "/api/ventures") {
    const user = requireRole(request, response, ["founder", "admin"]);
    if (!user) return true;
    const payload = await readJson(request);
    const required = ["name", "founder", "sector", "stage", "problem", "solution", "customer", "traction", "goals"];
    const missing = required.filter((field) => !String(payload[field] || "").trim());
    if (missing.length) {
      sendJson(response, 400, { error: `Missing fields: ${missing.join(", ")}` });
      return true;
    }

    const values = required.map((field) => String(payload[field]).trim());
    const result = database
      .prepare(`
        INSERT INTO ventures
        (user_id, name, founder, sector, stage, problem, solution, customer, traction, goals, created_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `)
      .run(user.id, ...values, nowIso());
    const venture = database.prepare("SELECT * FROM ventures WHERE id = ?").get(result.lastInsertRowid);
    sendJson(response, 201, { venture });
    return true;
  }

  if (request.method === "POST" && pathname === "/api/validate") {
    const user = requireUser(request, response);
    if (!user) return true;
    const payload = await readJson(request);
    const venture = payload.venture || payload;
    let result;
    let source = AI_PROVIDER || "local";
    try {
      result = (await callAiJson(validationPrompt(venture), validationSchema())) || localValidation(venture);
    } catch (error) {
      result = localValidation(venture);
      result.summary = `${result.summary} API call failed: ${error.message}`;
      source = "local";
    }
    saveReport(venture.id, "validation", result);
    sendJson(response, 200, { source, result });
    return true;
  }

  if (request.method === "GET" && pathname === "/api/ai-status") {
    sendJson(response, 200, {
      enabled: Boolean(AI_PROVIDER),
      provider: AI_PROVIDER,
      model: AI_PROVIDER ? AI_MODEL : null,
      key_name: process.env.OPENAI_API_KEY ? "OPENAI_API_KEY" : process.env.GROQ_API_KEY ? "GROQ_API_KEY" : process.env.ADVANCED_AI_API_KEY ? "ADVANCED_AI_API_KEY" : null,
    });
    return true;
  }

  if (request.method === "POST" && pathname === "/api/nlp") {
    const user = requireUser(request, response);
    if (!user) return true;
    const payload = await readJson(request);
    const text = String(payload.text || "");
    if (!text.trim()) {
      sendJson(response, 400, { error: "Text is required for NLP analysis." });
      return true;
    }
    let result;
    let source = AI_PROVIDER || "local";
    try {
      result = (await callAiJson(nlpPrompt(text), nlpSchema())) || localNlp(text);
    } catch (error) {
      result = localNlp(text);
      result.market_signals.push(`API call failed: ${error.message}`);
      source = "local";
    }
    saveReport(payload.venture_id, "nlp", result);
    sendJson(response, 200, { source, result });
    return true;
  }

  if (request.method === "POST" && pathname === "/api/faq") {
    const user = requireUser(request, response);
    if (!user) return true;
    const payload = await readJson(request);
    const question = String(payload.question || "").trim();
    if (!question) {
      sendJson(response, 400, { error: "Question is required." });
      return true;
    }
    let result;
    let source = AI_PROVIDER || "local";
    try {
      result = (await callAiJson(faqPrompt(question), faqSchema())) || localFaq(question);
    } catch (error) {
      result = localFaq(question);
      result.next_steps.push(`AI call failed: ${error.message}`);
      source = "local";
    }
    sendJson(response, 200, { source, result });
    return true;
  }

  if (request.method === "POST" && pathname === "/api/suggestions") {
    const user = requireUser(request, response);
    if (!user) return true;
    const payload = await readJson(request);
    const message = String(payload.message || "").trim();
    if (!message) {
      sendJson(response, 400, { error: "Message is required." });
      return true;
    }
    let result;
    let source = AI_PROVIDER || "local";
    try {
      result = (await callAiJson(suggestionPrompt(message, payload.venture), suggestionSchema())) || localSuggestion(message, payload.venture);
    } catch (error) {
      result = localSuggestion(message, payload.venture);
      result.risks_to_watch.push(`AI call failed: ${error.message}`);
      source = "local";
    }
    sendJson(response, 200, { source, result });
    return true;
  }

  if (request.method === "POST" && pathname === "/api/roadmap") {
    const user = requireUser(request, response);
    if (!user) return true;
    const payload = await readJson(request);
    const score = Number(payload.score || 0);
    if (score <= 75) {
      sendJson(response, 403, { error: "Roadmap unlocks only when validation score is above 75." });
      return true;
    }
    let result;
    let source = AI_PROVIDER || "local";
    try {
      result = (await callAiJson(roadmapPrompt(payload.venture, score), roadmapSchema())) || localRoadmap(payload.venture, score);
    } catch (error) {
      result = localRoadmap(payload.venture, score);
      result.funding_readiness.push(`AI call failed: ${error.message}`);
      source = "local";
    }
    saveReport(payload.venture?.id, "roadmap", result);
    sendJson(response, 200, { source, result });
    return true;
  }

  return false;
}

async function routeStatic(response, pathname) {
  const requested = pathname === "/" ? "index.html" : pathname.slice(1);
  const filePath = resolve(join(PUBLIC, requested));
  if (!filePath.startsWith(PUBLIC) || !existsSync(filePath)) {
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
    sendJson(response, 500, { error: error.message });
  }
});

server.listen(PORT, "127.0.0.1", () => {
  console.log(`Venture platform running at http://127.0.0.1:${PORT}`);
});
