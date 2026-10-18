import assert from "node:assert/strict";
import { parseQrPageProgress } from "./qr_bingo_page_progress.ts";
const event={event_key:'event',revision:16};
const valid={eventConfig:event,fixture:false,scanned:['12','23'],inShowScanned:['23'],vendorDrawScanned:['12','23']};
const parse=(value: Parameters<typeof parseQrPageProgress>[0])=>parseQrPageProgress(value,['12','23'],'event',16);
Deno.test('strict parser accepts complete production snapshots including all-empty proof',()=>{
  assert.deepEqual(parse(valid),{scanned:['12','23'],inShowScanned:['23'],vendorDrawScanned:['12','23']});
  assert.deepEqual(parse({...valid,scanned:[],inShowScanned:[],vendorDrawScanned:[]}),{scanned:[],inShowScanned:[],vendorDrawScanned:[]});
});
Deno.test('missing, malformed, duplicate, foreign, noncanonical or inconsistent arrays fail to legacy path',()=>{
  for(const field of ['scanned','inShowScanned','vendorDrawScanned']){
    for(const value of [undefined,null,'12',{},[12],['012'],['12 '],['12','12'],['999'],['1e2'],['-12'],['0']]){
      assert.equal(parse({...valid,[field]:value}),undefined,`${field}: ${JSON.stringify(value)}`);
    }
  }
  assert.equal(parse({...valid,scanned:['12']}),undefined);
  assert.equal(parse({...valid,vendorDrawScanned:['12']}),undefined);
  assert.equal(parseQrPageProgress(valid,['12','12'],'event',16),undefined);
});
Deno.test('event revision, event identity and fixture context must match exactly',()=>{
  for(const eventConfig of [null,[],{}, {...event,event_key:'other'}, {...event,revision:15},{...event,revision:'16'}])assert.equal(parse({...valid,eventConfig}),undefined);
  for(const fixture of [undefined,null,true,0,'false'])assert.equal(parse({...valid,fixture}),undefined);
});
