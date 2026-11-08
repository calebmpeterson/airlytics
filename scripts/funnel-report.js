const https = require('node:https');
const readline = require('node:readline/promises');
const { Writable } = require('node:stream');

const REPORT_URL = 'https://analytics.cubicle6.com/.netlify/functions/funnel-report';

function defaultDates(now = new Date()) {
  const end = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  const start = new Date(end.getTime() - 29 * 86400000);
  return { from: start.toISOString().slice(0, 10), to: end.toISOString().slice(0, 10) };
}

function validDate(value) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(`${value}T00:00:00Z`);
  return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value;
}

function validate({ token, pid, from, to, opportunity }) {
  if (!token || !/^[\x21-\x7e]+$/.test(token)) throw new Error('A nonempty report token without spaces is required.');
  if (!/^app[A-Za-z0-9]{1,30}$/.test(pid)) throw new Error('Enter a valid Airtable base ID beginning with app.');
  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(opportunity)) throw new Error('Opportunity must be a lowercase, hyphenated slug.');
  if (!validDate(from) || !validDate(to)) throw new Error('Dates must be valid YYYY-MM-DD dates.');
  const days = (Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 86400000;
  if (days < 0 || days >= 31) throw new Error('The inclusive date window must be at most 31 days.');
}

function fetchReport({ token, pid, from, to, opportunity }, request = https.get) {
  const url = new URL(REPORT_URL);
  url.search = new URLSearchParams({ pid, from, to, opportunity }).toString();
  return new Promise((resolve, reject) => {
    const req = request(url, { headers: { Authorization: `Bearer ${token}`, Accept: 'application/json' } }, res => {
      let body = '';
      res.setEncoding('utf8');
      res.on('data', chunk => { body += chunk; if (body.length > 1024 * 1024) req.destroy(new Error('Report response is too large.')); });
      res.on('error', () => reject(new Error('The report response was interrupted.')));
      res.on('end', () => {
        if (res.statusCode !== 200) {
          const message = res.statusCode === 401 ? 'Authentication failed. Check the report token and redeploy after changing it.' :
            res.statusCode === 403 ? 'Access to this base is forbidden. Check the report base allowlist.' :
            res.statusCode === 400 ? 'The report parameters were rejected.' : 'The report service failed.';
          return reject(new Error(`${message} (HTTP ${res.statusCode})`));
        }
        try { resolve(JSON.parse(body)); } catch (_) { reject(new Error('The report service returned invalid JSON.')); }
      });
    });
    req.setTimeout(30000, () => req.destroy(new Error('The report request timed out.')));
    req.on('error', () => reject(new Error('Could not complete the HTTPS request to the report service.')));
  });
}

async function main({ input = process.stdin, output = process.stdout, request = https.get, now = new Date() } = {}) {
  if (!input.isTTY || !output.isTTY) throw new Error('Run this script in an interactive terminal so the token can be entered privately.');
  let muted = false;
  const promptOutput = new Writable({ write(chunk, encoding, callback) { if (!muted) output.write(chunk, encoding); callback(); } });
  const rl = readline.createInterface({ input, output: promptOutput, terminal: true });
  const controller = new AbortController();
  rl.on('SIGINT', () => controller.abort());
  const question = text => rl.question(text, { signal: controller.signal });
  try {
    output.write('Report token (input hidden): ');
    muted = true;
    let token;
    try { token = await question(''); } finally { muted = false; output.write('\n'); }
    const pid = (await question('Airtable base ID: ')).trim();
    const opportunity = (await question('Opportunity slug (e.g. bulk-editor): ')).trim();
    const defaults = defaultDates(now);
    const from = (await question(`From date [${defaults.from}]: `)).trim() || defaults.from;
    const to = (await question(`To date [${defaults.to}]: `)).trim() || defaults.to;
    const params = { token, pid, opportunity, from, to };
    validate(params);
    const report = await fetchReport(params, request);
    output.write(`${JSON.stringify(report, null, 2)}\n`);
  } finally { rl.close(); }
}

if (require.main === module) {
  main().catch(error => { console.error(error.message); process.exitCode = 1; });
}
module.exports = { defaultDates, validate, fetchReport, main };
