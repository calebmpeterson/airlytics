require('dotenv').config();
const Airtable = require('airtable');

const CORS = {
  'Content-Type': 'application/json',
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': '*',
  'Access-Control-Allow-Methods': 'GET,HEAD,PUT,PATCH,POST,DELETE',
};
const allowed = new Set(['opportunity', 'offerVersion', 'priceCents', 'currency', 'source', 'medium', 'pageType']);
const invalid = message => { console.warn(JSON.stringify({ operation: 'event_validation', category: 'invalid_input' })); return response(400, { error: message }); };
const response = (statusCode, body) => ({ statusCode, headers: CORS, body: JSON.stringify(body) });
const warn = (category, code) => console.warn(JSON.stringify({ operation: 'properties_update', category, code }));

function propertiesJson(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const entries = Object.entries(value);
  if (entries.length > 20 || entries.some(([key, v]) => !allowed.has(key) || key.length > 64 || !(v === null || typeof v === 'boolean' || (typeof v === 'number' && Number.isFinite(v)) || (typeof v === 'string' && v.length <= 64 && /^[a-zA-Z0-9_-]+$/.test(v))))) return null;
  const json = JSON.stringify(value);
  return Buffer.byteLength(json) <= 2048 ? json : null;
}

function timeout(promise, ms) {
  let timer;
  return Promise.race([promise, new Promise((_, reject) => { timer = setTimeout(() => reject(Object.assign(new Error('timeout'), { code: 'TIMEOUT' })), ms); })]).finally(() => clearTimeout(timer));
}

function createHandler({ base = (pid, requestTimeout = 8000) => new Airtable({ apiKey: process.env.AIRTABLE_API_KEY, noRetryIfRateLimited: true, requestTimeout }).base(pid), updateTimeout = 2000 } = {}) {
  return async (event, context = {}) => {
    if (event.httpMethod === 'OPTIONS') return response(204, {});
    if (!['GET', 'POST'].includes(event.httpMethod)) return response(405, { error: 'Method not allowed' });
    const headers = Object.fromEntries(Object.entries(event.headers || {}).map(([k, v]) => [k.toLowerCase(), v]));
    let data;
    if (event.httpMethod === 'POST') {
      try {
        const body = event.isBase64Encoded ? Buffer.from(event.body || '', 'base64').toString('utf8') : (event.body || '');
        if (Buffer.byteLength(body) > 8192) return invalid('Invalid body');
        data = JSON.parse(body);
        if (!data || Array.isArray(data) || typeof data !== 'object' || !['pid', 'pathname', 'action'].every(k => typeof data[k] === 'string' && data[k].trim()) || (data.sid !== undefined && typeof data.sid !== 'string')) return invalid('Invalid core event');
      } catch (_) { return invalid('Invalid JSON'); }
    } else {
      data = event.queryStringParameters || {};
    }
    let pathname = data.pathname;
    if (pathname === undefined && headers.referer) {
      try { pathname = new URL(headers.referer).pathname; } catch (_) { /* invalid referer */ }
    }
    const fields = { 'Client ID': data.sid === undefined ? '' : data.sid, Pathname: pathname, Action: data.action === undefined ? 'page:view' : data.action, 'Date / Time': new Date(), Country: headers['x-country'] || '', 'Client IP': headers['client-ip'] || context.ip };
    let table, record;
    try {
      table = base(data.pid)('Visits');
      const records = await table.create([{ fields }]);
      record = records[0];
    } catch (_) {
      console.error(JSON.stringify({ operation: 'core_create', category: 'airtable_error' }));
      return response(500, 'Event capture failed');
    }
    if (event.httpMethod === 'GET') return response(200, { success: true });
    let enrichment = 'not_requested';
    if (Object.prototype.hasOwnProperty.call(data, 'properties')) {
      const json = propertiesJson(data.properties);
      if (!json) { enrichment = 'skipped'; warn('invalid_properties', 'INVALID_PROPERTIES'); }
      else if (!record || !record.id) { enrichment = 'skipped'; warn('missing_record_id', 'MISSING_RECORD_ID'); }
      else {
        try { await timeout(base(data.pid, Math.max(1, updateTimeout - 250))('Visits').update(record.id, { Properties: json }), updateTimeout); enrichment = 'saved'; }
        catch (error) { enrichment = 'failed'; warn(error && (error.code === 'TIMEOUT' || error.name === 'AbortError') ? 'timeout' : 'airtable_error', error && /^[A-Z0-9_]{1,64}$/.test(error.code || '') ? error.code : 'UPDATE_FAILED'); }
      }
    }
    return response(200, { success: true, enrichment });
  };
}
exports.handler = createHandler();
exports.createHandler = createHandler;
