#!/usr/bin/env node
/**
 * Run: node scripts/check-env.js
 * Checks which .env.local keys are set and warns about missing critical ones.
 */

const fs = require("fs");
const path = require("path");

const envFile = path.join(__dirname, "../.env.local");

if (!fs.existsSync(envFile)) {
  console.error("❌  .env.local not found! Copy ENV_SETUP.md template first.");
  process.exit(1);
}

const content = fs.readFileSync(envFile, "utf8");
const lines = content.split("\n").filter((l) => !l.startsWith("#") && l.includes("="));

const env = {};
for (const line of lines) {
  const [key, ...rest] = line.split("=");
  env[key.trim()] = rest.join("=").trim();
}

const check = (key, required, hint) => {
  const val = env[key];
  const set = val && val.length > 0;
  const icon = set ? "✅" : required ? "🚨" : "⚠️ ";
  const label = set ? "SET" : required ? "MISSING (REQUIRED)" : "not set (optional)";
  console.log(`${icon}  ${key.padEnd(35)} ${label}`);
  if (!set && hint) console.log(`       ↳ ${hint}`);
};

console.log("\n=== Webiox War Room — Env Check ===\n");

check("NEXT_PUBLIC_SUPABASE_URL",    true,  "Get from Supabase project settings");
check("NEXT_PUBLIC_SUPABASE_ANON_KEY", true, "Get from Supabase project settings → API");
check("SUPABASE_SERVICE_ROLE_KEY",   true,  "Get from Supabase project settings → API");
check("GEMINI_API_KEY",              true,  "Get from aistudio.google.com");
check("GOOGLE_PLACES_API_KEY",       true,  "⚡ THIS IS WHY LEADS NOT FOUND — get free key at console.cloud.google.com, enable 'Places API (New)'");
check("HUNTER_API_KEY",              false, "Free 25/month at hunter.io — improves email finding");
check("APOLLO_API_KEY",              false, "Free 50/month at apollo.io — improves LinkedIn leads");
check("RESEND_API_KEY",              false, "Needed for email outreach at resend.com");
check("INNGEST_EVENT_KEY",           false, "Only needed in production");
check("INNGEST_SIGNING_KEY",         false, "Only needed in production");

const criticalMissing = [
  "NEXT_PUBLIC_SUPABASE_URL",
  "NEXT_PUBLIC_SUPABASE_ANON_KEY",
  "SUPABASE_SERVICE_ROLE_KEY",
  "GEMINI_API_KEY",
  "GOOGLE_PLACES_API_KEY",
].filter((k) => !env[k] || env[k].length === 0);

console.log("");
if (criticalMissing.length === 0) {
  console.log("✅  All critical keys set! You can run: npm run dev");
} else {
  console.log(`🚨  ${criticalMissing.length} critical key(s) missing. Leads WILL NOT work until fixed.`);
  console.log("    See ENV_SETUP.md for instructions.\n");
}
