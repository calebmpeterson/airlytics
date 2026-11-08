const { test } = require('node:test');
const assert = require('node:assert/strict');
const { createHandler } = require('../functions/event');
function setup(options = {}) {
  const calls = [];
  const table = { create: async rows => { calls.push(['create', rows]); if (options.createError) throw Error('failure'); return [{ id: 'rec1' }]; }, update: async (...args) => { calls.push(['update', ...args]); if (options.update) return options.update(); } };
  return { calls, handler: createHandler({ base: pid => name => { calls.push(['base', pid, name]); return table; }, updateTimeout: 10 }) };
}
const get = (query = {}) => ({ httpMethod: 'GET', headers: { referer: 'https://example.com/from', 'x-country': 'US', 'client-ip': '1.2.3.4' }, queryStringParameters: { pid: 'app1', ...query } });
const post = properties => ({ httpMethod: 'POST', headers: {}, body: JSON.stringify({ pid: 'app1', pathname: '/path', action: 'page:load', ...(properties === undefined ? {} : { properties }) }) });
test('legacy GET and OPTIONS preserve six fields and defaults', async () => {
  const { handler, calls } = setup();
  assert.equal((await handler({ httpMethod: 'OPTIONS' })).statusCode, 204);
  const res = await handler(get({ sid: 'visitor', pathname: '/path', action: 'page:load' }));
  assert.equal(res.body, '{"success":true}'); assert.equal(res.statusCode, 200);
  assert.deepEqual(calls[0], ['base', 'app1', 'Visits']);
  const fields = calls[1][1][0].fields;
  assert.deepEqual(Object.keys(fields), ['Client ID', 'Pathname', 'Action', 'Date / Time', 'Country', 'Client IP']);
  assert.equal(fields['Client ID'], 'visitor'); assert.equal(fields.Pathname, '/path'); assert.equal(fields.Action, 'page:load'); assert.equal(fields.Country, 'US'); assert.equal(fields['Client IP'], '1.2.3.4'); assert.ok(fields['Date / Time'] instanceof Date);
  await handler(get()); assert.equal(calls[3][1][0].fields.Pathname, '/from'); assert.equal(calls[3][1][0].fields.Action, 'page:view'); assert.equal(calls[3][1][0].fields['Client ID'], '');
  assert.equal((await handler({httpMethod:'GET', headers:{}, queryStringParameters:null})).statusCode, 200);
});
test('POST writes core first and enriches same record', async () => {
  const {handler,calls}=setup(); const result=await handler(post({ source:'google', priceCents:12900 }));
  assert.equal(JSON.parse(result.body).enrichment,'saved'); assert.equal(calls.filter(x=>x[0]==='create').length,1); assert.deepEqual(calls[3], ['update','rec1',{Properties:'{"source":"google","priceCents":12900}'}]);
  const plain=setup(); assert.equal(JSON.parse((await plain.handler(post())).body).enrichment,'not_requested'); assert.equal(plain.calls.length,2);
});
test('optional invalid, missing field, permissions and timeout never fail capture', async () => {
  for (const update of [() => Promise.reject(Object.assign(Error('unknown field'),{code:'UNKNOWN_FIELD_NAME'})), () => Promise.reject(Object.assign(Error('denied'),{code:'NOT_AUTHORIZED'})), () => new Promise(()=>{})]) {
    const {handler,calls}=setup({update}); const result=await handler(post({source:'google'})); assert.equal(result.statusCode,200); assert.equal(JSON.parse(result.body).enrichment,'failed'); assert.equal(calls.filter(x=>x[0]==='create').length,1);
  }
  const {handler,calls}=setup(); const result=await handler(post({email:'person@example.com'})); assert.equal(JSON.parse(result.body).enrichment,'skipped'); assert.equal(calls.length,2);
});
test('bad core input fails before write; failed core write is not retried', async () => {
  const {handler,calls}=setup({createError:true}); assert.equal((await handler({httpMethod:'POST',body:'{'})).statusCode,400); assert.equal((await handler({httpMethod:'POST',body:'{}'})).statusCode,400); assert.equal(calls.length,0); assert.equal((await handler(get())).statusCode,500); assert.equal(calls.filter(x=>x[0]==='create').length,1);
});
