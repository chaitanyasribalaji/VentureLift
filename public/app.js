const state = {
  user: null,
  ventures: [],
  selectedVenture: null,
  latestScore: null,
};

const $ = (selector) => document.querySelector(selector);
const $$ = (selector) => [...document.querySelectorAll(selector)];

async function api(path, options = {}) {
  const response = await fetch(path, {
    credentials: "same-origin",
    headers: { "Content-Type": "application/json" },
    ...options,
  });
  const data = await response.json();
  if (!response.ok) throw new Error(data.error || "Request failed");
  return data;
}

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function isEmailValid(email) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(email || "").trim());
}

function isNameValid(name) {
  return /^[A-Za-z][A-Za-z0-9 '\-\.]*$/.test(String(name || "").trim());
}

function passwordStrength(password) {
  const value = String(password || "").trim();
  let score = 0;
  if (value.length >= 6) score += 20;
  if (value.length >= 10) score += 15;
  if (/[a-z]/.test(value)) score += 20;
  if (/[A-Z]/.test(value)) score += 20;
  if (/[0-9]/.test(value)) score += 15;
  if (/[^A-Za-z0-9]/.test(value)) score += 10;
  score = Math.min(100, score);
  if (!value) return { score: 0, label: "" };
  if (score >= 75) return { score, label: "Strong" };
  if (score >= 45) return { score, label: "Medium" };
  return { score, label: "Weak" };
}

function setFieldFeedback(elementId, message, level = "error") {
  const element = $(`#${elementId}`);
  if (!element) return;
  element.textContent = message;
  element.classList.remove("strong", "medium", "weak", "error");
  if (level) element.classList.add(level);
}

function clearFieldFeedback(elementId) {
  const element = $(`#${elementId}`);
  if (!element) return;
  element.textContent = "";
  element.classList.remove("strong", "medium", "weak", "error");
}

function updatePasswordFeedback(password) {
  const feedbackId = "registerPasswordFeedback";
  if (!$( `#${feedbackId}` )) return;
  if (!password) {
    setFieldFeedback(feedbackId, "Password should be at least 6 characters.", "weak");
    return;
  }
  const strength = passwordStrength(password);
  setFieldFeedback(feedbackId, `${strength.label} password strength`, strength.label.toLowerCase());
}

function validateLoginForm(form) {
  clearFieldFeedback("loginEmailFeedback");
  clearFieldFeedback("loginPasswordFeedback");
  let valid = true;
  const email = String(form.email.value || "").trim();
  const password = String(form.password.value || "");

  if (!email) {
    setFieldFeedback("loginEmailFeedback", "Email is required.", "error");
    valid = false;
  } else if (!isEmailValid(email)) {
    setFieldFeedback("loginEmailFeedback", "Enter a valid email address.", "error");
    valid = false;
  }

  if (!password) {
    setFieldFeedback("loginPasswordFeedback", "Password is required.", "error");
    valid = false;
  } else if (password.length < 6) {
    setFieldFeedback("loginPasswordFeedback", "Password must be at least 6 characters.", "error");
    valid = false;
  }

  return valid;
}

function validateRegisterForm(form) {
  clearFieldFeedback("registerNameFeedback");
  clearFieldFeedback("registerEmailFeedback");
  clearFieldFeedback("registerPasswordFeedback");
  let valid = true;
  const name = String(form.name.value || "").trim();
  const email = String(form.email.value || "").trim();
  const password = String(form.password.value || "");

  if (!name) {
    setFieldFeedback("registerNameFeedback", "Name is required.", "error");
    valid = false;
  } else if (!isNameValid(name)) {
    setFieldFeedback("registerNameFeedback", "Name must start with a letter and not begin with a number.", "error");
    valid = false;
  }

  if (!email) {
    setFieldFeedback("registerEmailFeedback", "Email is required.", "error");
    valid = false;
  } else if (!isEmailValid(email)) {
    setFieldFeedback("registerEmailFeedback", "Enter a valid email address.", "error");
    valid = false;
  }

  if (!password) {
    setFieldFeedback("registerPasswordFeedback", "Password is required.", "error");
    valid = false;
  } else if (password.length < 6) {
    setFieldFeedback("registerPasswordFeedback", "Password must be at least 6 characters.", "weak");
    valid = false;
  } else {
    updatePasswordFeedback(password);
  }

  return valid;
}

function listItems(items) {
  if (!Array.isArray(items)) return "";
  return `<ul>${items.map((item) => `<li>${escapeHtml(item)}</li>`).join("")}</ul>`;
}

function selectedVenture() {
  const id = Number($("#ventureSelect").value);
  return state.ventures.find((item) => item.id === id) || state.selectedVenture || state.ventures[0] || null;
}

function switchView(viewId) {
  const tab = $(`.tab[data-view="${viewId}"]`);
  if (tab?.classList.contains("hidden")) viewId = "dashboard";
  $$(".tab").forEach((item) => item.classList.toggle("active", item.dataset.view === viewId));
  $$(".view").forEach((view) => view.classList.toggle("active", view.id === viewId));
  if (viewId === "mentor") loadSearchDefaults();
  if (viewId === "ai") loadAiStatus();
}

function switchAuth(type) {
  $$(".auth-tab").forEach((tab) => tab.classList.toggle("active", tab.dataset.auth === type));
  $$(".auth-form").forEach((form) => form.classList.toggle("active", form.id === `${type}Form`));
}

function applyRoleUi() {
  const role = state.user?.role;
  $("#authScreen").classList.toggle("hidden", Boolean(state.user));
  $("#appShell").classList.toggle("hidden", !state.user);
  if (!state.user) {
    switchView("dashboard");
    $("#loginStatus").textContent = "";
    $("#registerStatus").textContent = "";
    return;
  }

  $("#roleLine").textContent = `${state.user.name} - ${role.toUpperCase()} account`;
  $$(".founder-only, .mentor-only, .admin-only").forEach((node) => {
    const allowedRoles = [];
    if (node.classList.contains("founder-only")) allowedRoles.push("founder");
    if (node.classList.contains("mentor-only")) allowedRoles.push("mentor");
    if (node.classList.contains("admin-only")) allowedRoles.push("admin");
    node.classList.toggle("hidden", !allowedRoles.includes(role));
  });

  const title = role === "mentor" ? "Mentor command center" : role === "admin" ? "Admin command center" : "Founder command center";
  $("#commandTitle").textContent = title;
  $("#roleCards").innerHTML = roleCards(role);
}

function roleCards(role) {
  const cards = {
    founder: [
      ["Discover", "Customer pain, market size, alternatives"],
      ["Validate", "Experiments, interviews, proof"],
      ["Launch", "MVP, early users, traction"],
      ["Fund", "Pitch, grants, investor readiness"],
    ],
    mentor: [
      ["Review", "Study founder ventures and identify key risks"],
      ["Advise", "Suggest experiments, milestones, and customer evidence"],
      ["Match", "Connect founders with programs, experts, and funders"],
      ["Track", "Follow venture progress across stages"],
    ],
    admin: [
      ["Manage users", "View founder, mentor, and admin accounts"],
      ["Monitor ventures", "See all platform venture profiles"],
      ["Coordinate mentors", "Route ventures to the right expertise"],
      ["Govern platform", "Keep roles and workflows organized"],
    ],
  };
  return cards[role].map(([label, detail]) => `<div><strong>${label}</strong><span>${detail}</span></div>`).join("");
}

function renderDashboard() {
  $("#ventureCount").textContent = state.ventures.length;
  $("#avgScore").textContent = state.latestScore ? `${state.latestScore}/100` : "--";
  const stageCounts = state.ventures.reduce((acc, venture) => {
    acc[venture.stage] = (acc[venture.stage] || 0) + 1;
    return acc;
  }, {});
  const topStage = Object.entries(stageCounts).sort((a, b) => b[1] - a[1])[0]?.[0] || "Idea";
  $("#stageFocus").textContent = topStage;

  const list = $("#ventureList");
  if (!state.ventures.length) {
    list.innerHTML = `<div class="venture-card"><h3>No ventures yet</h3><p>${emptyPortfolioText()}</p></div>`;
    return;
  }

  list.innerHTML = state.ventures
    .map(
      (venture) => `
        <article class="venture-card">
          <h3>${escapeHtml(venture.name)}</h3>
          <p>${escapeHtml(venture.problem).slice(0, 170)}${venture.problem.length > 170 ? "..." : ""}</p>
          <div class="tag-row">
            <span>${escapeHtml(venture.stage)}</span>
            <span>${escapeHtml(venture.sector)}</span>
            <span>${escapeHtml(venture.traction)}</span>
            ${venture.owner_name ? `<span>${escapeHtml(venture.owner_name)}</span>` : ""}
          </div>
        </article>
      `,
    )
    .join("");
}

function emptyPortfolioText() {
  if (state.user?.role === "founder") return "Create your first venture profile to activate the platform.";
  return "No founder ventures are available for review yet.";
}

function renderVentureSelect() {
  const select = $("#ventureSelect");
  if (!state.ventures.length) {
    select.innerHTML = `<option>No ventures available</option>`;
    state.selectedVenture = null;
    updateRoadmapState();
    return;
  }
  select.innerHTML = state.ventures.map((venture) => `<option value="${venture.id}">${escapeHtml(venture.name)}</option>`).join("");
  state.selectedVenture = state.ventures[0];
  updateRoadmapState();
}

function renderValidation(payload, source) {
  const result = payload.result;
  state.latestScore = result.score;
  renderDashboard();
  updateRoadmapState();
  $("#validationResult").innerHTML = `
    <article class="result-card">
      <div class="score">${escapeHtml(result.score || "--")}</div>
      <strong>${source === "openai" ? "AI model validation" : "Local fallback validation"}</strong>
      <p>${escapeHtml(result.summary || "")}</p>
    </article>
    <article class="result-card"><strong>Strengths</strong>${listItems(result.strengths)}</article>
    <article class="result-card"><strong>Risks</strong>${listItems(result.risks)}</article>
    <article class="result-card"><strong>Experiments</strong>${listItems(result.experiments)}</article>
    <article class="result-card"><strong>Next 30 days</strong>${listItems(result.next_30_days)}</article>
  `;
}

function renderNlp(payload, source) {
  const result = payload.result;
  $("#nlpResult").innerHTML = `
    <article class="result-card">
      <strong>${source === "openai" ? "AI NLP analysis" : "Local NLP fallback"}</strong>
      <p>Clarity score: <b>${escapeHtml(result.clarity_score || "--")}/100</b></p>
      <p>Sentiment: ${escapeHtml(result.sentiment || "")}</p>
    </article>
    <article class="result-card"><strong>Keywords</strong><div class="tag-row">${(result.keywords || [])
      .map((item) => `<span>${escapeHtml(item)}</span>`)
      .join("")}</div></article>
    <article class="result-card"><strong>Market signals</strong>${listItems(result.market_signals)}</article>
    <article class="result-card"><strong>Missing information</strong>${listItems(result.missing_information)}</article>
    <article class="result-card"><strong>Improved statement</strong><p>${escapeHtml(result.improved_statement || "")}</p></article>
  `;
}

function renderFaq(payload) {
  const result = payload.result;
  $("#faqResult").innerHTML = `
    <article class="result-card">
      <strong>${payload.source === "openai" ? "AI FAQ answer" : "Local FAQ answer"}</strong>
      <p>${escapeHtml(result.answer)}</p>
    </article>
    <article class="result-card"><strong>Next steps</strong>${listItems(result.next_steps)}</article>
    <article class="result-card"><strong>Related topics</strong><div class="tag-row">${(result.related_topics || [])
      .map((topic) => `<span>${escapeHtml(topic)}</span>`)
      .join("")}</div></article>
  `;
}

function renderSuggestions(payload) {
  const result = payload.result;
  $("#suggestionResult").innerHTML = `
    <article class="result-card">
      <strong>${payload.source === "openai" ? "AI suggestion" : "Local suggestion"}</strong>
      <p>${escapeHtml(result.reply)}</p>
    </article>
    <article class="result-card"><strong>Action items</strong>${listItems(result.action_items)}</article>
    <article class="result-card"><strong>Risks to watch</strong>${listItems(result.risks_to_watch)}</article>
    <article class="result-card"><strong>Mentor angle</strong><p>${escapeHtml(result.mentor_angle)}</p></article>
  `;
}

function renderRoadmap(payload) {
  const result = payload.result;
  $("#roadmapResult").innerHTML = `
    <article class="result-card">
      <strong>${payload.source === "openai" ? "AI roadmap" : "Local roadmap"}</strong>
      <p>${escapeHtml(result.summary)}</p>
    </article>
    ${(result.weeks || [])
      .map(
        (week) => `
          <article class="result-card">
            <strong>${escapeHtml(week.period)}: ${escapeHtml(week.focus)}</strong>
            ${listItems(week.tasks)}
          </article>
        `,
      )
      .join("")}
    <article class="result-card"><strong>Milestones</strong>${listItems(result.milestones)}</article>
    <article class="result-card"><strong>Metrics</strong>${listItems(result.metrics)}</article>
    <article class="result-card"><strong>Funding readiness</strong>${listItems(result.funding_readiness)}</article>
  `;
}

function renderUsers(users) {
  $("#userList").innerHTML = users
    .map(
      (user) => `
        <article class="venture-card">
          <h3>${escapeHtml(user.name)}</h3>
          <p>${escapeHtml(user.email)}</p>
          <div class="tag-row">
            <span>${escapeHtml(user.role)}</span>
            <span>${escapeHtml(user.expertise || "No expertise added")}</span>
          </div>
        </article>
      `,
    )
    .join("");
}

function renderMentors(mentors) {
  const target = $("#mentorSearchResults");
  if (!mentors.length) {
    target.innerHTML = `<article class="venture-card"><h3>No mentors found</h3><p>Try a broader search like product, funding, AI, or marketing.</p></article>`;
    return;
  }
  target.innerHTML = mentors
    .map(
      (mentor) => `
        <article class="venture-card">
          <h3>${escapeHtml(mentor.name)}</h3>
          <p>${escapeHtml(mentor.email)}</p>
          <div class="tag-row">
            <span>mentor</span>
            <span>${escapeHtml(mentor.expertise || "General startup support")}</span>
          </div>
        </article>
      `,
    )
    .join("");
}

function renderVentureSearchResults(ventures) {
  const target = $("#ventureSearchResults");
  if (!ventures.length) {
    target.innerHTML = `<article class="venture-card"><h3>No ventures found</h3><p>Try searching by stage, sector, founder, or customer.</p></article>`;
    return;
  }
  target.innerHTML = ventures
    .map(
      (venture) => `
        <article class="venture-card">
          <h3>${escapeHtml(venture.name)}</h3>
          <p>${escapeHtml(venture.problem)}</p>
          <div class="tag-row">
            <span>${escapeHtml(venture.stage)}</span>
            <span>${escapeHtml(venture.sector)}</span>
            <span>${escapeHtml(venture.owner_name || venture.founder)}</span>
          </div>
        </article>
      `,
    )
    .join("");
}

async function loadSession() {
  const data = await api("/api/me");
  state.user = data.user;
  applyRoleUi();
  if (state.user) await loadVentures();
}

function setAiStatus(enabled, provider, model) {
  const status = $("#aiStatus");
  if (!status) return;
  if (enabled) {
    const providerLabel = provider === "groq" ? "Groq enabled" : "OpenAI enabled";
    status.textContent = `${providerLabel} — model: ${model}`;
  } else {
    status.textContent = "AI key not configured. The platform is using local AI fallback analysis.";
  }
  status.classList.toggle("active", enabled);
}

async function loadAiStatus() {
  try {
    const data = await api("/api/ai-status");
    setAiStatus(data.enabled, data.provider, data.model);
  } catch (error) {
    const status = $("#aiStatus");
    if (status) status.textContent = "Unable to determine AI status.";
  }
}

async function login(email, password) {
  const data = await api("/api/login", {
    method: "POST",
    body: JSON.stringify({ email, password }),
  });
  state.user = data.user;
  $("#loginStatus").textContent = "";
  applyRoleUi();
  await loadVentures();
  switchView("dashboard");
}

async function loadVentures() {
  const data = await api("/api/ventures");
  state.ventures = data.ventures;
  renderDashboard();
  renderVentureSelect();
}

async function searchMentors() {
  const query = $("#mentorSearchInput").value.trim();
  $("#mentorSearchResults").innerHTML = `<article class="venture-card">Searching mentors...</article>`;
  try {
    const data = await api(`/api/mentors?q=${encodeURIComponent(query)}`);
    renderMentors(data.mentors);
  } catch (error) {
    $("#mentorSearchResults").innerHTML = `<article class="venture-card">${escapeHtml(error.message)}</article>`;
  }
}

async function searchVentures() {
  const query = $("#ventureSearchInput").value.trim();
  $("#ventureSearchResults").innerHTML = `<article class="venture-card">Searching ventures...</article>`;
  try {
    const data = await api(`/api/ventures?q=${encodeURIComponent(query)}`);
    renderVentureSearchResults(data.ventures);
  } catch (error) {
    $("#ventureSearchResults").innerHTML = `<article class="venture-card">${escapeHtml(error.message)}</article>`;
  }
}

function loadSearchDefaults() {
  if (!state.user) return;
  if (["founder", "admin"].includes(state.user.role)) searchMentors();
  if (["mentor", "admin"].includes(state.user.role)) searchVentures();
}

async function saveVenture(event) {
  event.preventDefault();
  const form = event.currentTarget;
  const payload = Object.fromEntries(new FormData(form).entries());
  $("#saveStatus").textContent = "Saving...";
  try {
    await api("/api/ventures", {
      method: "POST",
      body: JSON.stringify(payload),
    });
    form.reset();
    $("#saveStatus").textContent = "Venture saved to the database.";
    await loadVentures();
    switchView("ai");
  } catch (error) {
    $("#saveStatus").textContent = error.message;
  }
}

async function validateSelected() {
  if (!state.ventures.length || !state.selectedVenture) {
    $("#validationResult").innerHTML = `<article class="result-card">Create or select a venture first.</article>`;
    return;
  }
  const id = Number($("#ventureSelect").value);
  const venture = state.ventures.find((item) => item.id === id) || state.selectedVenture;
  $("#validationResult").innerHTML = `<article class="result-card">Running validation...</article>`;
  const payload = await api("/api/validate", {
    method: "POST",
    body: JSON.stringify({ venture }),
  });
  renderValidation(payload, payload.source);
}

async function analyzeNlp() {
  const text = $("#nlpText").value.trim();
  if (!text) {
    $("#nlpResult").innerHTML = `<article class="result-card">Paste text to analyze.</article>`;
    return;
  }
  $("#nlpResult").innerHTML = `<article class="result-card">Analyzing language...</article>`;
  const payload = await api("/api/nlp", {
    method: "POST",
    body: JSON.stringify({ text }),
  });
  renderNlp(payload, payload.source);
}

async function askFaq() {
  const question = $("#faqQuestion").value.trim();
  if (!question) {
    $("#faqResult").innerHTML = `<article class="result-card">Type a question first.</article>`;
    return;
  }
  $("#faqResult").innerHTML = `<article class="result-card">Getting answer...</article>`;
  try {
    const payload = await api("/api/faq", {
      method: "POST",
      body: JSON.stringify({ question }),
    });
    renderFaq(payload);
  } catch (error) {
    $("#faqResult").innerHTML = `<article class="result-card">${escapeHtml(error.message)}</article>`;
  }
}

async function requestSuggestions() {
  const message = $("#suggestionMessage").value.trim();
  if (!message) {
    $("#suggestionResult").innerHTML = `<article class="result-card">Enter a message for the mentor bot.</article>`;
    return;
  }
  if (!state.selectedVenture) {
    $("#suggestionResult").innerHTML = `<article class="result-card">Select a venture before asking for suggestions.</article>`;
    return;
  }
  $("#suggestionResult").innerHTML = `<article class="result-card">Preparing suggestions...</article>`;
  try {
    const payload = await api("/api/suggestions", {
      method: "POST",
      body: JSON.stringify({ message, venture: state.selectedVenture }),
    });
    renderSuggestions(payload);
  } catch (error) {
    $("#suggestionResult").innerHTML = `<article class="result-card">${escapeHtml(error.message)}</article>`;
  }
}

async function generateRoadmap() {
  const venture = state.selectedVenture || state.ventures[0];
  if (!venture) {
    $("#roadmapResult").innerHTML = `<article class="result-card">Save or select a venture first.</article>`;
    return;
  }
  if (!state.latestScore || state.latestScore <= 75) {
    $("#roadmapResult").innerHTML = `<article class="result-card">Roadmap unlocks only at a score above 75.</article>`;
    return;
  }
  $("#roadmapResult").innerHTML = `<article class="result-card">Generating roadmap...</article>`;
  try {
    const payload = await api("/api/roadmap", {
      method: "POST",
      body: JSON.stringify({ venture, score: state.latestScore }),
    });
    renderRoadmap(payload);
  } catch (error) {
    $("#roadmapResult").innerHTML = `<article class="result-card">${escapeHtml(error.message)}</article>`;
  }
}

function updateRoadmapState() {
  const button = $("#roadmapBtn");
  const lock = $("#roadmapLock");
  const score = Number(state.latestScore || 0);
  if (!button || !lock) return;
  if (score > 75 && state.selectedVenture) {
    button.disabled = false;
    lock.textContent = `Ready to generate a 90-day roadmap. Current score: ${score}.`;
  } else if (score) {
    button.disabled = true;
    lock.textContent = `Roadmap unlocks only when validation score is above 75. Current score: ${score}.`;
  } else {
    button.disabled = true;
    lock.textContent = "Run validation first. Roadmap unlocks when score is above 75.";
  }
}

async function loadUsers() {
  $("#userList").innerHTML = `<article class="venture-card">Loading users...</article>`;
  try {
    const data = await api("/api/users");
    renderUsers(data.users);
  } catch (error) {
    $("#userList").innerHTML = `<article class="venture-card">${escapeHtml(error.message)}</article>`;
  }
}

async function logout() {
  try {
    await api("/api/logout", { method: "POST", body: "{}" });
  } finally {
    state.user = null;
    state.ventures = [];
    state.selectedVenture = null;
    state.latestScore = null;
    $("#mentorSearchResults").innerHTML = "";
    $("#ventureSearchResults").innerHTML = "";
    applyRoleUi();
  }
}

$$(".tab").forEach((tab) => tab.addEventListener("click", () => switchView(tab.dataset.view)));
$$(".auth-tab").forEach((tab) => tab.addEventListener("click", () => switchAuth(tab.dataset.auth)));

$("#loginForm").addEventListener("submit", async (event) => {
  event.preventDefault();
  const form = event.currentTarget;
  if (!validateLoginForm(form)) {
    $("#loginStatus").textContent = "Please fix the highlighted fields.";
    return;
  }
  const payload = Object.fromEntries(new FormData(form).entries());
  $("#loginStatus").textContent = "Logging in...";
  try {
    await login(payload.email, payload.password);
  } catch (error) {
    $("#loginStatus").textContent = error.message;
  }
});

$("#registerForm").addEventListener("submit", async (event) => {
  event.preventDefault();
  const form = event.currentTarget;
  if (!validateRegisterForm(form)) {
    $("#registerStatus").textContent = "Please fix the highlighted fields.";
    return;
  }
  const payload = Object.fromEntries(new FormData(form).entries());
  $("#registerStatus").textContent = "Creating account...";
  try {
    await api("/api/register", {
      method: "POST",
      body: JSON.stringify(payload),
    });
    $("#registerStatus").textContent = "Account created. You can login now.";
    form.reset();
    switchAuth("login");
    $("#loginForm").email.value = payload.email;
  } catch (error) {
    $("#registerStatus").textContent = error.message;
  }
});

const registerNameInput = $("#registerForm input[name='name']");
const registerEmailInput = $("#registerForm input[name='email']");
const registerPasswordInput = $("#registerForm input[name='password']");
const loginEmailInput = $("#loginForm input[name='email']");
const loginPasswordInput = $("#loginForm input[name='password']");

if (registerNameInput) {
  registerNameInput.addEventListener("blur", (event) => {
    const value = event.target.value;
    if (value && !isNameValid(value)) {
      setFieldFeedback("registerNameFeedback", "Name must start with a letter and not begin with a number.", "error");
    } else {
      clearFieldFeedback("registerNameFeedback");
    }
  });
}

if (registerEmailInput) {
  registerEmailInput.addEventListener("blur", (event) => {
    const value = event.target.value;
    if (value && !isEmailValid(value)) {
      setFieldFeedback("registerEmailFeedback", "Enter a valid email address.", "error");
    } else {
      clearFieldFeedback("registerEmailFeedback");
    }
  });
}

if (registerPasswordInput) {
  registerPasswordInput.addEventListener("input", (event) => {
    updatePasswordFeedback(event.target.value);
  });
}

if (loginEmailInput) {
  loginEmailInput.addEventListener("blur", (event) => {
    const value = event.target.value;
    if (value && !isEmailValid(value)) {
      setFieldFeedback("loginEmailFeedback", "Enter a valid email address.", "error");
    } else {
      clearFieldFeedback("loginEmailFeedback");
    }
  });
}

if (loginPasswordInput) {
  loginPasswordInput.addEventListener("blur", (event) => {
    const value = event.target.value;
    if (value && value.length < 6) {
      setFieldFeedback("loginPasswordFeedback", "Password must be at least 6 characters.", "error");
    } else {
      clearFieldFeedback("loginPasswordFeedback");
    }
  });
}

$("#ventureForm").addEventListener("submit", saveVenture);
$("#refreshBtn").addEventListener("click", loadVentures);
$("#mentorSearchBtn").addEventListener("click", searchMentors);
$("#ventureSearchBtn").addEventListener("click", searchVentures);
$("#mentorSearchInput").addEventListener("keydown", (event) => {
  if (event.key === "Enter") searchMentors();
});
$("#ventureSearchInput").addEventListener("keydown", (event) => {
  if (event.key === "Enter") searchVentures();
});
$("#validateBtn").addEventListener("click", validateSelected);
$("#nlpBtn").addEventListener("click", analyzeNlp);
$("#faqBtn").addEventListener("click", askFaq);
$("#suggestionBtn").addEventListener("click", requestSuggestions);
$("#roadmapBtn").addEventListener("click", generateRoadmap);
$("#loadUsersBtn").addEventListener("click", loadUsers);
$("#logoutBtn").addEventListener("click", logout);
$("#ventureSelect").addEventListener("change", (event) => {
  state.selectedVenture = state.ventures.find((venture) => venture.id === Number(event.target.value));
  updateRoadmapState();
});

loadSession();
loadAiStatus();
updateRoadmapState();