const {test}=require('node:test'); const assert=require('node:assert/strict');
const {createHandler}=require('../functions/funnel-report');
const request = {httpMethod:'GET',headers:{authorization:'Bearer secret'},queryStringParameters:{pid:'app123',from:'2026-11-01',to:'2026-11-30',opportunity:'bulk-editor'}};
test('auth, bounds, no view, aggregation and truncation', async () => {
  process.env.AIRLYTICS_REPORT_TOKEN='secret'; let reads=0, options;
  const rows=[
    {fields:{'Date / Time':'2026-11-01T00:00:00Z',Action:'page:load',Pathname:'/squarespace-tools/bulk-editor','Client ID':'a'}},
    {fields:{'Date / Time':'2026-11-02T00:00:00Z',Action:'experiment:bulk-editor:purchase_intent_click:v1','Client ID':'a',Properties:'{"source":"google"}'}},
    {fields:{'Date / Time':'2026-11-03T00:00:00Z',Action:'experiment:bulk-editor:purchase_intent_click:v1',Properties:'bad'}},
    {fields:{'Date / Time':'2026-11-04T00:00:00Z',Action:'page:load',Pathname:'/squarespace-tools/bulk-editor'}}
  ];
  const handler=createHandler({maxRecords:3,base:()=>()=>({select:o=>{options=o; reads++; return {all:async()=>rows};}})});
  assert.equal((await handler({...request,headers:{}})).statusCode,401); assert.equal(reads,0);
  assert.equal((await handler({...request,queryStringParameters:{...request.queryStringParameters,to:'2027-01-01'}})).statusCode,400); assert.equal(reads,0);
  const result=JSON.parse((await handler(request)).body); assert.equal(options.view,undefined); assert.equal(options.maxRecords,4); assert.equal(result.truncated,true); assert.equal(result.stages.landing.events,1); assert.equal(result.stages.purchase_intent_click.events,2); assert.equal(result.stages.purchase_intent_click.identifiedVisitors,1); assert.equal(result.stages.purchase_intent_click.missingIdentifiers,1); assert.equal(result.propertiesCoverage.status,'partial'); assert.equal(result.breakdowns.source.google,1); assert.equal(result.partial,true);
});
test('legacy rows need no properties or view and empty denominators are null', async () => {
  process.env.AIRLYTICS_REPORT_TOKEN='secret'; const handler=createHandler({base:()=>()=>({select:()=>({all:async()=>[{fields:{'Date / Time':'2026-11-02',Action:'experiment:bulk-editor:pricing_viewed:v1'}}]})})});
  const r=JSON.parse((await handler(request)).body); assert.equal(r.propertiesCoverage.status,'unavailable'); assert.equal(r.conversionRates.pricing_viewed,null); assert.equal(r.stages.pricing_viewed.missingIdentifiers,1);
});
