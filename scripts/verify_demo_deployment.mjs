/** Verify real TLS, Pages fallback, session boundaries and SSE; no token logging. */
import { chromium, expect } from '../apps/web/node_modules/@playwright/test/index.mjs';
import { chmod } from 'node:fs/promises';

const frontend = process.env.FLEET_CHECK_FRONTEND;
const backend = process.env.FLEET_CHECK_BACKEND;
if (!frontend || !backend) throw Error('Set FLEET_CHECK_FRONTEND and FLEET_CHECK_BACKEND HTTPS origins');
for (const url of [frontend, backend]) if (new URL(url).protocol !== 'https:') throw Error('HTTPS required');
const insecure = process.env.FLEET_CHECK_LOCAL_TLS === '1';
if (insecure && [frontend, backend].some(url => !['localhost', '127.0.0.1'].includes(new URL(url).hostname))) throw Error('Test certificate bypass is confined to localhost');
const browser = await chromium.launch({ channel: 'chrome' });
try {
  const context = await browser.newContext({ ignoreHTTPSErrors: insecure });
  const page = await context.newPage();
  const api = `${backend.replace(/\/$/, '')}/api`;
  const health = await context.request.get(`${api}/health/ready`);
  expect(health.status()).toBe(200);
  expect((await health.json()).status).toBe('ready');
  const origin = new URL(frontend).origin;
  const preflight = await context.request.fetch(`${api}/access/session`, {
    method: 'OPTIONS', headers: { Origin: origin, 'Access-Control-Request-Method': 'POST', 'Access-Control-Request-Headers': 'content-type,x-csrf-token' },
  });
  expect(preflight.status()).toBe(200);
  expect(preflight.headers()['access-control-allow-origin']).toBe(origin);
  expect(preflight.headers()['access-control-allow-credentials']).toBe('true');
  const denied = await context.request.fetch(`${api}/access/session`, {
    method: 'OPTIONS', headers: { Origin: 'https://untrusted.example', 'Access-Control-Request-Method': 'POST' },
  });
  expect(denied.status()).toBe(400);
  await page.goto(frontend);
  await page.waitForURL(`${backend.replace(/\/$/, '')}/demo`, { timeout: 45_000 });
  await page.getByLabel('Account ID').fill(process.env.FLEET_CHECK_USER || 'demo-supervisor');
  await page.getByLabel('Password', { exact: true }).fill(process.env.FLEET_CHECK_PASSWORD || 'AeroCare-Demo-2026!');
  await page.getByRole('button', { name: 'Sign in', exact: true }).click();
  await page.getByRole('button', { name: 'Select workspace', exact: true }).click();
  await page.getByRole('dialog').getByRole('button', { name: 'Skip', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Create my trial', exact: true })).toBeVisible({timeout:20_000});
  const identity = await context.request.get(`${api}/access/session`);
  expect(identity.status()).toBe(200);
  const session = await identity.json();
  expect(session.authentication).toBe('server session');
  expect((await context.cookies()).some(cookie => cookie.name === 'fleet_session' && cookie.secure && cookie.httpOnly && cookie.sameSite === 'Strict')).toBe(true);
  expect((await context.request.delete(`${api}/access/session`, { headers: { Origin: backend } })).status()).toBe(403);
  expect((await context.request.delete(`${api}/access/session`, { headers: { Origin: 'https://untrusted.example', 'X-CSRF-Token': session.csrf_token } })).status()).toBe(403);
  const stream = await page.evaluate(() => new Promise(resolve => {
    const source = new EventSource('/api/events', { withCredentials: true });
    const timer = setTimeout(() => { source.close(); resolve('timeout'); }, 10_000);
    source.addEventListener('connected', () => { clearTimeout(timer); source.close(); resolve('connected'); });
    source.onerror = () => { clearTimeout(timer); source.close(); resolve('error'); };
  }));
  expect(stream).toBe('connected');
  if (process.env.FLEET_CHECK_STORAGE_PATH) {
    await context.storageState({ path: process.env.FLEET_CHECK_STORAGE_PATH });
    await chmod(process.env.FLEET_CHECK_STORAGE_PATH, 0o600);
  }
  await page.route(`${api}/health/ready`, route => route.abort());
  await page.goto(frontend);
  await expect(page.getByRole('heading', { name: 'Demo backend offline' })).toBeVisible({timeout:20_000});
  console.log(JSON.stringify({ frontend, backend, trustedTLS: !insecure, pagesFallback: 'passed', exactOriginCORS: 'passed', sessionCookie: 'Secure HttpOnly Strict', csrfRejection: 'passed', sse: stream, offlineState: 'passed' }));
} finally { await browser.close(); }
