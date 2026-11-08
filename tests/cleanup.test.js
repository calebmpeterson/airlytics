const {test}=require('node:test'); const assert=require('node:assert/strict'); const vm=require('node:vm'); const fs=require('node:fs');
test('cleanup preserves view, retention filter, pagination and deletion batches', () => {
  const deletions=[]; let options, next=0;
  const table={ select:o=>{ options=o; return {eachPage:(page,done)=>{page([{id:'rec1',get:()=>''},{id:'rec2',get:()=>''}],()=>next++); page([{id:'rec3',get:()=>''}],()=>next++); done();}}; }, destroy:(ids,cb)=>{deletions.push(ids); cb(null,ids);} };
  const context={require:name=>name==='dotenv'?{config(){}}:{base:pid=>{assert.equal(pid,'app1'); return name=>{assert.equal(name,'Visits');return table;};}},process:{argv:['node','script','app1'],exit:()=>{throw Error('exit');}},console:{log(){},error(){throw Error('unexpected error');}}};
  vm.runInNewContext(fs.readFileSync(require.resolve('../scripts/delete-old-records'),'utf8'),context);
  assert.equal(options.view,'All Events'); assert.equal(options.pageSize,10); assert.equal(options.filterByFormula,"DATETIME_DIFF(NOW(), CREATED_TIME(), 'months') > 6"); assert.deepEqual(JSON.parse(JSON.stringify(deletions)),[['rec1','rec2'],['rec3']]); assert.equal(next,2);
});
