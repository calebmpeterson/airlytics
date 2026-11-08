const { test } = require('node:test');
const assert = require('node:assert/strict');
const { EventEmitter } = require('node:events');
const { defaultDates, validate, fetchReport, main } = require('../scripts/funnel-report');
const valid = { token: 'secret-token', pid: 'app123', from: '2026-11-01', to: '2026-11-30', opportunity: 'bulk-editor' };
function fakeRequest(status, body, inspect) {
  return (url, options, callback) => {
    inspect(url, options);
    const req = new EventEmitter(); req.setTimeout = () => {}; req.destroy = () => {};
    process.nextTick(() => { const res = new EventEmitter(); res.statusCode = status; res.setEncoding = () => {}; callback(res); res.emit('data', body); res.emit('end'); });
    return req;
  };
}
test('client defaults and input validation match report limits', () => {
  assert.deepEqual(defaultDates(new Date('2026-11-08T12:00:00Z')), {from:'2026-10-10',to:'2026-11-08'});
  assert.doesNotThrow(() => validate(valid));
  for (const invalid of [{token:'secret\n'}, {pid:'YOUR_BASE_ID'}, {from:'2026-02-30'}, {from:'2026-09-01'}, {opportunity:'not a slug'}]) assert.throws(() => validate({...valid,...invalid}));
});
test('client sends authenticated HTTPS request and prints parsed report', async () => {
  const result = await fetchReport(valid, fakeRequest(200, '{"opportunity":"bulk-editor"}', (url, options) => {
    assert.equal(url.origin, 'https://analytics.cubicle6.com'); assert.equal(url.pathname, '/.netlify/functions/funnel-report'); assert.equal(url.searchParams.get('pid'), 'app123'); assert.equal(options.headers.Authorization, 'Bearer secret-token'); assert.equal(url.toString().includes('secret-token'), false);
  }));
  assert.deepEqual(result, { opportunity:'bulk-editor' });
});
test('client reports authentication errors without leaking response or token', async () => {
  await assert.rejects(fetchReport(valid, fakeRequest(401, 'secret-token', () => {})), error => /HTTP 401/.test(error.message) && !error.message.includes('secret-token'));
  await assert.rejects(main({input:{isTTY:false},output:{isTTY:false}}), /interactive terminal/);
});
