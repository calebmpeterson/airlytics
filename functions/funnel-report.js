require('dotenv').config();
const Airtable = require('airtable');
const crypto = require('crypto');
const MAX_RECORDS = 5000;
const stages = ['landing', 'preview_interaction', 'pricing_viewed', 'purchase_intent_click', 'email_submitted', 'email_confirmed'];
const reply = (statusCode, body) => ({ statusCode, headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' }, body: JSON.stringify(body) });
function date(value) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value || '')) return null;
  const d = new Date(value + 'T00:00:00Z');
  return Number.isFinite(d.getTime()) && d.toISOString().slice(0, 10) === value ? d : null;
}
function aggregate(records, opportunity, from, end, truncated) {
  const counts = Object.fromEntries(stages.map(s => [s, { events: 0, identifiedVisitors: 0, missingIdentifiers: 0 }]));
  const visitors = Object.fromEntries(stages.map(s => [s, new Set()]));
  const breakdowns = {};
  let present = 0, valid = 0, relevant = 0;
  for (const record of records) {
    const f = record.fields || {};
    const when = Date.parse(f['Date / Time']);
    if (!Number.isFinite(when) || when < from || when >= end) continue;
    const action = f.Action || '';
    let stage;
    if (action === 'page:load' && (f.Pathname === `/squarespace-tools/${opportunity}` || f.Pathname === `/squarespace-tools/${opportunity}/`)) stage = 'landing';
    else {
      const match = /^experiment:([a-z0-9-]+):([a-z_]+):([a-zA-Z0-9_-]+)$/.exec(action);
      if (match && match[1] === opportunity && stages.includes(match[2]) && match[2] !== 'landing') stage = match[2];
    }
    if (!stage) continue;
    relevant++; counts[stage].events++;
    if (typeof f['Client ID'] === 'string' && f['Client ID'].trim()) visitors[stage].add(f['Client ID']);
    else counts[stage].missingIdentifiers++;
    if (f.Properties !== undefined && f.Properties !== '') {
      present++;
      try {
        const p = JSON.parse(f.Properties);
        if (!p || typeof p !== 'object' || Array.isArray(p)) throw new Error();
        valid++;
        for (const key of ['source', 'medium', 'currency', 'priceCents', 'offerVersion', 'pageType']) {
          const value = p[key];
          if (!['string', 'number', 'boolean'].includes(typeof value) || String(value).length > 256) continue;
          const bucket = breakdowns[key] ||= {};
          const label = String(value);
          if (!Object.hasOwn(bucket, label)) Object.defineProperty(bucket, label, { value: 0, writable: true, enumerable: true });
          bucket[label]++;
        }
      } catch (_) { console.warn(JSON.stringify({ operation: 'report_properties', category: 'invalid_properties' })); }
    }
  }
  for (const stage of stages) counts[stage].identifiedVisitors = counts[stage].events && !visitors[stage].size ? null : visitors[stage].size;
  if (relevant && !present) console.warn(JSON.stringify({ operation: 'report_properties', category: 'unavailable' }));
  const conversionRates = {};
  for (const stage of stages.slice(1)) conversionRates[stage] = counts.landing.events ? counts[stage].events / counts.landing.events : null;
  return { opportunity, from: new Date(from).toISOString().slice(0,10), to: new Date(end - 1).toISOString().slice(0,10), stages: counts, conversionRates, propertiesCoverage: { relevantRecords: relevant, present, valid, status: present === 0 ? 'unavailable' : valid === relevant ? 'complete' : 'partial' }, breakdowns, truncated, partial: truncated || counts && Object.values(counts).some(x => x.missingIdentifiers > 0) || (present > 0 && valid < relevant) };
}
function createHandler({ base = pid => new Airtable({ apiKey: process.env.AIRTABLE_API_KEY, noRetryIfRateLimited: true, requestTimeout: 8000 }).base(pid), maxRecords = MAX_RECORDS } = {}) {
  return async event => {
    const secret = process.env.AIRLYTICS_REPORT_TOKEN;
    const headers = Object.fromEntries(Object.entries(event.headers || {}).map(([k, v]) => [k.toLowerCase(), v]));
    const provided = (headers.authorization || '').replace(/^Bearer /i, '');
    const a = Buffer.from(secret || ''), b = Buffer.from(provided);
    if (!secret || !/^Bearer /i.test(headers.authorization || '') || a.length !== b.length || !crypto.timingSafeEqual(a, b)) return reply(401, { error: 'Unauthorized' });
    if (event.httpMethod !== 'GET') return reply(405, { error: 'Method not allowed' });
    const q = event.queryStringParameters || {}, from = date(q.from), to = date(q.to);
    if (!/^app[A-Za-z0-9]{1,30}$/.test(q.pid || '') || !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(q.opportunity || '') || !from || !to || to < from || to - from >= 31 * 86400000) return reply(400, { error: 'Invalid report parameters' });
    const allowlist = process.env.AIRLYTICS_REPORT_BASE_IDS;
    if (allowlist && !allowlist.split(',').map(x => x.trim()).includes(q.pid)) return reply(403, { error: 'Forbidden' });
    const end = to.getTime() + 86400000;
    try {
      const records = await base(q.pid)('Visits').select({ pageSize: 100, maxRecords: maxRecords + 1, filterByFormula: `AND({Date / Time} >= DATETIME_PARSE('${from.toISOString()}'), {Date / Time} < DATETIME_PARSE('${new Date(end).toISOString()}'))` }).all();
      const truncated = records.length > maxRecords;
      return reply(200, aggregate(records.slice(0, maxRecords), q.opportunity, from.getTime(), end, truncated));
    } catch (_) { console.error(JSON.stringify({ operation: 'report_read', category: 'airtable_error' })); return reply(500, { error: 'Report unavailable' }); }
  };
}
exports.handler = createHandler();
exports.createHandler = createHandler;
exports.aggregate = aggregate;
