const { test } = require('node:test'); const assert = require('node:assert/strict');
const fetchPath = require.resolve('airtable/lib/fetch'); let requests = [], replies = [];
require.cache[fetchPath] = { id: fetchPath, filename: fetchPath, loaded: true, exports: async (url, options) => { requests.push({url, options}); const item = replies.shift(); return {status:item.status || 200, json:async()=>item.body}; } };
const Airtable = require('airtable');
const makeBase = () => new Airtable({apiKey:'test', endpointUrl:'https://example.invalid', noRetryIfRateLimited:true, requestTimeout:1000}).base('app123');
test('0.12.2 promise create/update and paginated select, with no retry on 429', async () => {
  requests=[]; replies=[{body:{records:[{id:'rec1',fields:{Action:'page:load'}}]}},{body:{id:'rec1',fields:{Properties:'{}'}}},{body:{records:[{id:'rec1',fields:{Action:'page:load'}}],offset:'next'}},{body:{records:[{id:'rec2',fields:{Action:'page:view'}}]}},{status:429,body:{error:{type:'RATE_LIMITED',message:'rate limited'}}}];
  const table=makeBase()('Visits'); const created=await table.create([{fields:{Action:'page:load'}}]); assert.equal(created[0].id,'rec1');
  const updated=await table.update(created[0].id,{Properties:'{}'}); assert.equal(updated.id,'rec1'); assert.deepEqual(JSON.parse(requests[1].options.body),{fields:{Properties:'{}'}});
  const records=await table.select({pageSize:1}).all(); assert.deepEqual(records.map(r=>r.id),['rec1','rec2']); assert.match(requests[3].url,/offset=next/);
  await assert.rejects(table.create([{fields:{Action:'page:load'}}])); assert.equal(requests.length,5);
});
