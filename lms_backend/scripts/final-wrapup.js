#!/usr/bin/env node
/**
 * Final wrap-up script:
 * 1) Run TypeORM migrations (against configured RDS/MySQL)
 * 2) Verify GET /api/user/stats returns averageReadinessScore === 0 for a fresh/empty user
 * 3) Read back Demo Guide text from README
 * 4) Run backend/frontend build checks (lint + CRA build)
 *
 * This script is designed for CI or manual execution in a properly configured environment.
 */

const { spawnSync } = require('child_process');
const fs = require('fs');
const path = require('path');
const http = require('http');
const https = require('https');

function log(msg) {
  // eslint-disable-next-line no-console
  console.log(msg);
}

function logErr(msg) {
  // eslint-disable-next-line no-console
  console.error(msg);
}

function run(cmd, args, opts = {}) {
  const res = spawnSync(cmd, args, {
    stdio: 'inherit',
    shell: false,
    ...opts,
  });
  if (res.status !== 0) {
    throw new Error(`Command failed (${cmd} ${args.join(' ')}), exit=${res.status}`);
  }
}

function requestJson(url, { method = 'GET', headers = {}, body } = {}) {
  return new Promise((resolve, reject) => {
    const u = new URL(url);
    const lib = u.protocol === 'https:' ? https : http;

    const req = lib.request(
      {
        method,
        hostname: u.hostname,
        port: u.port || (u.protocol === 'https:' ? 443 : 80),
        path: `${u.pathname}${u.search}`,
        headers: {
          Accept: 'application/json',
          ...headers,
        },
      },
      (res) => {
        let data = '';
        res.setEncoding('utf8');
        res.on('data', (chunk) => (data += chunk));
        res.on('end', () => {
          let parsed = null;
          try {
            parsed = data ? JSON.parse(data) : null;
          } catch (e) {
            // ignore JSON parse errors; include raw body below
          }
          resolve({
            status: res.statusCode,
            headers: res.headers,
            json: parsed,
            text: data,
          });
        });
      }
    );

    req.on('error', reject);
    if (body) req.write(typeof body === 'string' ? body : JSON.stringify(body));
    req.end();
  });
}

async function getDemoGuideText(readmePath) {
  const md = fs.readFileSync(readmePath, 'utf8');
  // Heuristic: "Demo Guide" section starts at a heading containing "Demo Guide"
  // and runs until next top-level heading.
  const lines = md.split('\n');
  const startIdx = lines.findIndex((l) => /^##\s+Demo Guide/i.test(l.trim()));
  if (startIdx === -1) return null;

  let endIdx = lines.length;
  for (let i = startIdx + 1; i < lines.length; i += 1) {
    if (/^##\s+/.test(lines[i].trim())) {
      endIdx = i;
      break;
    }
  }

  return lines.slice(startIdx, endIdx).join('\n').trim();
}

async function main() {
  const backendRoot = path.resolve(__dirname, '..');
  const repoRoot = path.resolve(backendRoot, '..'); // digitalt3-learning-insights-platform-311763-311772
  const workspaceRoot = path.resolve(repoRoot, '..'); // /home/kavia/.../code-generation
  const frontendRoot = path.join(workspaceRoot, 'digitalt3-learning-insights-platform-311763-311774', 'lms_frontend');

  const apiBase = process.env.API_BASE_URL || `http://localhost:${process.env.PORT || 3000}`;

  log('== Final Wrap-Up ==');
  log(`Backend: ${backendRoot}`);
  log(`Frontend: ${frontendRoot}`);
  log(`API_BASE_URL: ${apiBase}`);
  log('');

  // 1) Migrations
  log('1) Running DB migrations (TypeORM)...');
  try {
    run('npm', ['run', 'db:migrate'], { cwd: backendRoot });
    log('   OK: migrations applied.');
  } catch (e) {
    logErr('   FAILED: migrations could not be applied.');
    logErr('   This usually means RDS connectivity/env vars are not configured or network access is blocked.');
    throw e;
  }
  log('');

  // 2) Verify /api/user/stats
  log('2) Verifying GET /api/user/stats (expect 0)...');
  const bearer = process.env.DEMO_BEARER_TOKEN;
  if (!bearer) {
    logErr(
      '   SKIPPED: DEMO_BEARER_TOKEN not set. Provide a valid JWT (Authorization Bearer token) to verify stats.\n' +
        '   Example: DEMO_BEARER_TOKEN="<jwt>" node scripts/final-wrapup.js'
    );
  } else {
    const resp = await requestJson(`${apiBase}/api/user/stats`, {
      headers: { Authorization: `Bearer ${bearer}` },
    });

    if (resp.status !== 200) {
      logErr(`   FAILED: expected HTTP 200, got ${resp.status}. Body: ${resp.text}`);
      throw new Error('Stats endpoint verification failed');
    }
    const avg =
      resp.json?.averageReadinessScore ??
      resp.json?.avgReadinessScore ??
      resp.json?.readinessScore ??
      resp.json?.average ??
      null;

    if (avg === null || avg === undefined) {
      logErr(`   FAILED: could not find average readiness field in response. JSON: ${JSON.stringify(resp.json)}`);
      throw new Error('Stats endpoint response shape unexpected');
    }
    if (Number(avg) !== 0) {
      logErr(`   FAILED: expected average readiness score 0, got ${avg}. JSON: ${JSON.stringify(resp.json)}`);
      throw new Error('Stats endpoint average was not 0');
    }
    log(`   OK: /api/user/stats returned average readiness score = ${avg}`);
  }
  log('');

  // 3) Read back Demo Guide
  log('3) Demo Guide (from lms_backend/README.md):');
  const demo = await getDemoGuideText(path.join(backendRoot, 'README.md'));
  if (!demo) {
    logErr('   NOTE: No "## Demo Guide" section found in lms_backend/README.md');
  } else {
    log('----------------------------------------');
    log(demo);
    log('----------------------------------------');
  }
  log('');

  // 4) Build checks
  log('4) Build checks:');
  log('   4a) Backend lint...');
  run('npm', ['run', 'lint'], { cwd: backendRoot });
  log('   OK: backend lint complete.');
  log('');

  if (fs.existsSync(frontendRoot)) {
    log('   4b) Frontend build...');
    run('npm', ['run', 'build'], { cwd: frontendRoot, env: { ...process.env, CI: 'true' } });
    log('   OK: frontend build complete.');
  } else {
    logErr('   SKIPPED: Frontend folder not found; cannot run frontend build.');
  }

  log('\n== Final Wrap-Up complete ==');
}

main().catch((err) => {
  logErr('\nFinal wrap-up FAILED.');
  logErr(err && err.stack ? err.stack : String(err));
  process.exit(1);
});
