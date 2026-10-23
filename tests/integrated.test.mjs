/**
 * End-to-End Integration Test Suite for VentureLift Platform
 * 
 * Tests the integrated interaction across:
 * - HTTP Server <-> SQLite Database
 * - Session Management <-> Multi-role RBAC (Founder, Mentor, Admin)
 * - Venture Profile Creation <-> AI Validation <-> NLP Signal Engine
 * - Node Backend <-> Python CNN Subprocess (Prototype Matching & Real-world Benchmarks)
 * - Report Persistence & Querying across the full lifecycle
 */

import assert from "node:assert/strict";
import { createServer } from "node:http";
import { routeApi, initBackend } from "../lib/backend.mjs";

const PORT = 8092;
const BASE_URL = `http://127.0.0.1:${PORT}`;

const server = createServer(async (request, response) => {
  const url = new URL(request.url, `http://${request.headers.host}`);
  try {
    if (url.pathname.startsWith("/api/") && (await routeApi(request, response, url))) return;
    response.writeHead(404);
    response.end("Not found");
  } catch (error) {
    response.writeHead(500, { "Content-Type": "application/json" });
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

// 1x1 test PNG base64
const PROTOTYPE_TEST_IMAGE = "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==";

async function main() {
  console.log("\n=======================================================");
  console.log("       STARTING INTEGRATED END-TO-END TEST SUITE");
  console.log("=======================================================\n");

  await initBackend();

  await new Promise((res) => {
    server.listen(PORT, "127.0.0.1", () => {
      console.log(`Integrated test server running at ${BASE_URL}`);
      res();
    });
  });

  try {
    const timestamp = Date.now();
    const founderEmail = `founder_${timestamp}@integration.test`;
    let founderCookie = "";
    let ventureId = null;

    // STEP 1: Registration and Authentication Integration
    await runTest("Integration 1: Register new founder account", async () => {
      const res = await fetch(`${BASE_URL}/api/register`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: "Integration Founder",
          email: founderEmail,
          password: "SecurePassword@123",
          role: "founder",
          expertise: "Robotics & AI"
        })
      });
      assert.equal(res.status === 200 || res.status === 201, true);
      const data = await res.json();
      assert.equal(data.user.email, founderEmail);
      assert.equal(data.user.role, "founder");
    });

    await runTest("Integration 2: Login and receive session cookie", async () => {
      const res = await fetch(`${BASE_URL}/api/login`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email: founderEmail,
          password: "SecurePassword@123"
        })
      });
      assert.equal(res.status, 200);
      const setCookie = res.headers.get("set-cookie");
      assert.equal(Boolean(setCookie), true);
      founderCookie = setCookie.split(";")[0];
    });

    // STEP 2: Venture Profile Creation & Database Persistence
    await runTest("Integration 3: Create venture profile in database", async () => {
      const res = await fetch(`${BASE_URL}/api/ventures`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Cookie: founderCookie },
        body: JSON.stringify({
          name: "AeroPod Drone Logistics",
          founder: "Integration Founder",
          sector: "Robotics",
          stage: "Prototype",
          problem: "Suburban last-mile medical deliveries are delayed by road traffic jams.",
          solution: "Autonomous rapid-response medical payload drone with GPS waypoint teleoperation.",
          customer: "Regional hospitals and emergency blood banks.",
          traction: "Completed 30 test flights on private testing airfield.",
          goals: "Deploy hospital campus pilot and secure FAA Part 135 waiver."
        })
      });
      assert.equal(res.status, 201);
      const data = await res.json();
      assert.equal(typeof data.venture.id, "number");
      ventureId = data.venture.id;
    });

    await runTest("Integration 4: Verify venture profile appears in user's portfolio", async () => {
      const res = await fetch(`${BASE_URL}/api/ventures`, {
        headers: { Cookie: founderCookie }
      });
      assert.equal(res.status, 200);
      const data = await res.json();
      const ventures = data.ventures || [];
      const found = ventures.find(v => v.id === ventureId);
      assert.equal(Boolean(found), true);
      assert.equal(found.name, "AeroPod Drone Logistics");
      assert.equal(found.sector, "Robotics");
    });

    // STEP 3: AI Idea Validation & Report Persistence
    let validationScore = 0;
    await runTest("Integration 5: Run AI idea validation and store report in database", async () => {
      const res = await fetch(`${BASE_URL}/api/validate`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Cookie: founderCookie },
        body: JSON.stringify({
          venture: {
            id: ventureId,
            name: "AeroPod Drone Logistics",
            founder: "Integration Founder",
            sector: "Robotics",
            stage: "Prototype",
            problem: "Suburban last-mile medical deliveries are delayed by road traffic.",
            solution: "Autonomous medical payload drone with GPS waypoint teleoperation.",
            customer: "Regional hospitals and emergency blood banks.",
            traction: "Completed 30 test flights on private testing airfield.",
            goals: "Deploy hospital pilot."
          }
        })
      });
      assert.equal(res.status, 200);
      const data = await res.json();
      assert.equal(typeof data.result.score, "number");
      validationScore = data.result.score;
      assert.equal(data.result.score >= 50, true);
    });

    // STEP 4: NLP Market Signal & Pitch Analyzer Integration
    await runTest("Integration 6: Run NLP market signal analyzer on pitch statement", async () => {
      const res = await fetch(`${BASE_URL}/api/nlp`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Cookie: founderCookie },
        body: JSON.stringify({
          venture_id: ventureId,
          text: "We deliver life-saving blood and emergency vaccines directly to regional hospitals in under 12 minutes."
        })
      });
      assert.equal(res.status, 200);
      const data = await res.json();
      assert.equal(typeof data.result.clarity_score, "number");
      assert.equal(Array.isArray(data.result.keywords), true);
    });

    // STEP 5: Retrained CNN Prototype Matcher Integration
    await runTest("Integration 7: CNN prototype inference matches real-world products and provides MVP recommendations", async () => {
      const res = await fetch(`${BASE_URL}/api/cnn-predict`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Cookie: founderCookie },
        body: JSON.stringify({
          image_base64: PROTOTYPE_TEST_IMAGE,
          venture_id: ventureId
        })
      });
      assert.equal(res.status, 200);
      const data = await res.json();
      assert.equal(Boolean(data.prediction), true);
      
      const pred = data.prediction;
      assert.equal(typeof pred.match_count, "number");
      assert.equal(pred.match_count > 0, true);
      assert.equal(pred.top_matches.length > 0, true);
      
      // Verify match details include commercial products
      const topProduct = pred.top_matches[0];
      assert.equal(typeof topProduct.name, "string");
      assert.equal(typeof topProduct.similarity_score, "number");
      assert.equal(Boolean(topProduct.stage), true);
      
      // Verify tailored MVP suggestions
      const sugg = pred.suggestions;
      assert.equal(sugg.scope_pruning.length > 0, true);
      assert.equal(sugg.hardware_or_ux.length > 0, true);
      assert.equal(sugg.tech_stack_advice.length > 0, true);
      assert.equal(sugg.validation_milestones.length > 0, true);
    });

    // STEP 6: Strategic Roadmap Generation Integration
    await runTest("Integration 8: Generate strategic roadmap for high-validation venture", async () => {
      const res = await fetch(`${BASE_URL}/api/roadmap`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Cookie: founderCookie },
        body: JSON.stringify({
          venture: { id: ventureId, name: "AeroPod Drone Logistics" },
          score: Math.max(76, validationScore)
        })
      });
      assert.equal(res.status, 200);
      const data = await res.json();
      assert.equal(typeof data.result.summary, "string");
      assert.equal(Array.isArray(data.result.weeks), true);
      assert.equal(data.result.weeks.length > 0, true);
    });

    // STEP 7: Mentor Discovery & Role-Based Collaboration Integration
    await runTest("Integration 9: Mentor discovery queries mentor profiles by keyword", async () => {
      const res = await fetch(`${BASE_URL}/api/mentors?q=fundraising`, {
        headers: { Cookie: founderCookie }
      });
      assert.equal(res.status, 200);
      const data = await res.json();
      assert.equal(Array.isArray(data.mentors), true);
    });

    // STEP 8: Mentor Role Session & Cross-Inspection Integration
    await runTest("Integration 10: Mentor demo account logs in and reviews ventures", async () => {
      const loginRes = await fetch(`${BASE_URL}/api/login`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email: "mentor@venturelift.local",
          password: "Mentor@123"
        })
      });
      assert.equal(loginRes.status, 200);
      const mentorCookie = loginRes.headers.get("set-cookie").split(";")[0];

      const venturesRes = await fetch(`${BASE_URL}/api/ventures`, {
        headers: { Cookie: mentorCookie }
      });
      assert.equal(venturesRes.status, 200);
      const data = await venturesRes.json();
      const allVentures = data.ventures || [];
      assert.equal(allVentures.some(v => v.id === ventureId), true);
    });

    // STEP 9: Admin Role Platform Governance Integration
    await runTest("Integration 11: Admin demo account logs in and manages platform users", async () => {
      const loginRes = await fetch(`${BASE_URL}/api/login`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email: "admin@venturelift.local",
          password: "Admin@123"
        })
      });
      assert.equal(loginRes.status, 200);
      const adminCookie = loginRes.headers.get("set-cookie").split(";")[0];

      const usersRes = await fetch(`${BASE_URL}/api/users`, {
        headers: { Cookie: adminCookie }
      });
      assert.equal(usersRes.status, 200);
      const data = await usersRes.json();
      const users = data.users || [];
      assert.equal(users.some(u => u.email === founderEmail), true);
    });

    // STEP 10: Session Logout and Clean Teardown
    await runTest("Integration 12: Logout invalidates session cookie", async () => {
      const res = await fetch(`${BASE_URL}/api/logout`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Cookie: founderCookie }
      });
      assert.equal(res.status, 200);
      const setCookie = res.headers.get("set-cookie");
      assert.equal(setCookie.includes("Max-Age=0") || setCookie.includes("vl_session=;"), true);
    });

    console.log(`\nAll ${passedTests}/${totalTests} Integrated end-to-end tests passed successfully!\n`);
  } finally {
    server.close();
  }
}

main().catch((err) => {
  console.error("Integration suite failed:", err);
  process.exit(1);
});
