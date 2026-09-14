import assert from 'node:assert/strict';
import test from 'node:test';
import vm from 'node:vm';
import { readFileSync } from 'node:fs';

const source = readFileSync(new URL('../brilliant-directories/widgets/ww-qr-bingo-settings-data.js', import.meta.url), 'utf8');
const markup = readFileSync(new URL('../brilliant-directories/widgets/ww-qr-bingo-settings.php', import.meta.url), 'utf8');
const ID = '11111111-2222-4333-8444-555555555555';
const generated = '2026-09-14T12:00:00.000Z';
const flush = () => new Promise(resolve => setImmediate(resolve));
const response = (body, status = 200) => ({ ok: status < 400, status, json: async () => body });
class Element {
  constructor(id) { Object.assign(this, { id, value: '', textContent: '', disabled: false, hidden: true, children: [], listeners: {}, dataset: {}, valid: true }); }
  addEventListener(type, fn) { (this.listeners[type] ||= []).push(fn); }
  trigger(type) { for (const fn of this.listeners[type] || []) fn({ preventDefault() {} }); }
  appendChild(node) { this.children.push(node); return node; }
  replaceChildren(...nodes) { this.children = nodes; }
  setAttribute(key, value) { this[key] = value; }
  reportValidity() { return this.valid; }
  focus() { this.focused = true; }
  remove() {}
  click() { this.clicked = true; }
}
function fixture({ total = 501, respond } = {}) {
  const nodes = { token: new Element('token') };
  for (const match of markup.matchAll(/<[^>]+\bid="([A-Za-z0-9_-]+)"[^>]*>/g)) nodes[match[1]] = new Element(match[1]);
  const created = [], requests = [], blobs = [], revoked = [], timers = [];
  const document = { getElementById: id => nodes[id] || null, body: new Element('body'), createElement: tag => { const element = new Element(tag); created.push(element); return element; } };
  nodes.wwQrDataOperator.value = 'Offline Admin'; nodes.token.value = 'offline-csrf';
  nodes.wwQrDataEvent.value = 'invalid event ignored'; nodes.wwQrDataSearch.value = 'hidden contact'; nodes.wwQrDataVendor.value = '999'; nodes.wwQrDataContactStatus.value = 'removed';
  nodes.wwQrDataForm.action = 'https://ww2.managemydirectory.com/admin/go.php?widget=ww_qr_bingo_settings';
  nodes.wwQrDataForm.querySelector = () => nodes.token;
  const tabs = ['contacts', 'scans', 'entries', 'winners'].map(dataset => { const node = new Element(dataset); node.dataset.dataset = dataset; return node; });
  nodes.wwQrData.querySelectorAll = selector => selector === '[data-dataset]' ? tabs : [...Object.values(nodes), ...tabs];
  let uuid = 0;
  const context = vm.createContext({ document, URLSearchParams, AbortController, Error, Date,
    crypto: { randomUUID: () => '00000000-0000-4000-8000-' + String(++uuid).padStart(12, '0') },
    setTimeout: (fn, delay) => { timers.push({ fn, delay }); return timers.length; }, clearTimeout() {},
    Blob: class { constructor(parts, options) { this.parts = parts; this.options = options; blobs.push(this); } },
    URL: { createObjectURL: () => 'blob:offline', revokeObjectURL: url => revoked.push(url) },
    fetch: async (url, request) => {
      const fields = Object.fromEntries(new URLSearchParams(request.body)); requests.push({ url, request, fields });
      let body = { ok: true, action: fields.ww_qrbs_form_action, dataset: 'master_contacts', export_id: ID, total };
      if (body.action === 'master_contacts_export_start') body = { ...body, request_id: fields.request_id, columns: [{key:'couple_id',label:'Couple ID'}], csv_header: '\uFEFF"Couple ID"\r\n', page_size: 250, generated_at: generated, expires_at:'2026-09-14T12:15:00.000Z' };
      else if (body.action === 'master_contacts_export_page') {
        const cursor = Number(fields.cursor), count = Math.min(250,total-cursor), done = cursor+count===total;
        body = { ...body, cursor, row_count:count, next_cursor:done?null:cursor+count, done, csv_chunk:Array.from({length:count},(_,i)=>'"'+(cursor+i+1)+'"\r\n').join('') };
      } else body = { ...body, report:{filename:'weddingwin-master-couples.csv',mime_type:'text/csv;charset=utf-8',row_count:total,generated_at:generated} };
      return respond ? await respond(fields, body, requests) ?? response(body) : response(body);
    },
  });
  vm.runInContext(source, context);
  return { nodes, tabs, requests, blobs, created, revoked, timers, click:() => nodes.wwQrMasterExport.trigger('click'), initializeAgain:() => vm.runInContext(source, context) };
}

test('master download ignores every ordinary filter and assembles all pages above the former 5000 cap', async () => {
  const f = fixture({total:5001}); f.nodes.wwQrDataForm.valid=false;
  f.click(); await flush();
  assert.equal(f.requests.length,23);
  for (const {fields,request,url} of f.requests) {
    for (const key of ['search','event_key','vendor_id','contact_status','page','page_size']) assert(!(key in fields));
    assert.equal(fields.dataset,'master_contacts'); assert.equal(fields.operator_identity,'Offline Admin');
    assert.equal(fields.ww_qrbs_csrf_token,'offline-csrf'); assert.equal(request.credentials,'same-origin'); assert.equal(url,f.nodes.wwQrDataForm.action);
  }
  assert.deepEqual(f.requests.slice(1,-1).map(r=>Number(r.fields.cursor)),Array.from({length:21},(_,i)=>i*250));
  assert.equal(f.requests.at(-1).fields.expected_row_count,'5001');
  assert.equal(f.blobs.length,1); assert.equal(f.blobs[0].parts.join('').split('\r\n').length,5003);
  assert.match(f.nodes.wwQrMasterStatus.textContent,/5001 couples downloaded/);
  assert(f.created.some(node=>node.download==='weddingwin-master-couples.csv'&&node.clicked));
  f.timers.filter(t=>t.delay===1000).forEach(t=>t.fn()); assert.deepEqual(f.revoked,['blob:offline']);
});

test('zero couples downloads a header-only spreadsheet after the completion audit', async()=>{
  const f=fixture({total:0}); f.click(); await flush();
  assert.deepEqual(f.requests.map(r=>r.fields.ww_qrbs_form_action),['master_contacts_export_start','master_contacts_export_complete']);
  assert.equal(f.blobs[0].parts.join(''),'\uFEFF"Couple ID"\r\n'); assert.match(f.nodes.wwQrMasterStatus.textContent,/0 couples downloaded/);
});

test('missing operator makes no request and focuses the existing admin field',async()=>{
  const f=fixture(); f.nodes.wwQrDataOperator.value=''; f.click(); await flush();
  assert.equal(f.requests.length,0); assert.equal(f.nodes.wwQrDataOperator.focused,true); assert.match(f.nodes.wwQrMasterStatus.textContent,/admin name/);
});

test('rapid clicks and repeat initialization cannot start duplicate downloads',async()=>{
  let release; const held=new Promise(resolve=>{release=resolve;});
  const f=fixture({respond:async fields=>{if(fields.ww_qrbs_form_action==='master_contacts_export_start') await held;}});
  f.initializeAgain(); f.click(); f.click(); f.tabs[1].trigger('click');
  assert.equal(f.requests.length,1); assert.equal(f.nodes.wwQrMasterExport.disabled,true);
  release(); await flush(); assert.equal(f.blobs.length,1); assert.equal(f.nodes.wwQrMasterExport.disabled,false);
});

test('start identities and metadata must match before any contact pages are requested',async()=>{
  for(const patch of [{action:'data_list'},{dataset:'contacts'},{request_id:'foreign'},{export_id:'bad'},{total:-1},{total:'501'},{total:1.5},{page_size:500},{columns:[]},{csv_header:'missing BOM'},{generated_at:'bad'},{expires_at:'bad'}]){
    const f=fixture({respond:(fields,body)=>fields.ww_qrbs_form_action==='master_contacts_export_start'?response({...body,...patch}):undefined});
    f.click(); await flush(); assert.equal(f.requests.length,1,JSON.stringify(patch)); assert.equal(f.blobs.length,0); assert.match(f.nodes.wwQrMasterStatus.textContent,/No partial/);
  }
});

test('foreign, skipped, truncated or malformed pages never yield a partial file',async()=>{
  for(const patch of [{action:'data_list'},{dataset:'contacts'},{export_id:'foreign'},{total:500},{cursor:250},{row_count:249},{next_cursor:500},{done:true},{csv_chunk:''},{csv_chunk:null}]){
    const f=fixture({respond:(fields,body)=>fields.ww_qrbs_form_action==='master_contacts_export_page'?response({...body,...patch}):undefined});
    f.click(); await flush(); assert.equal(f.requests.length,2,JSON.stringify(patch)); assert.equal(f.blobs.length,0); assert.equal(f.nodes.wwQrMasterExport.disabled,false);
  }
});

test('audit or final report failure never releases the assembled private data',async()=>{
  for(const patch of [{action:'data_export'},{dataset:'contacts'},{export_id:'foreign'},{total:3},{report:{filename:'../bad.csv'}},{report:null}]){
    const f=fixture({respond:(fields,body)=>fields.ww_qrbs_form_action==='master_contacts_export_complete'?response({...body,...patch}):undefined});
    f.click(); await flush(); assert.equal(f.blobs.length,0,JSON.stringify(patch)); assert.match(f.nodes.wwQrMasterStatus.textContent,/No partial/);
  }
  const f=fixture({respond:fields=>fields.ww_qrbs_form_action==='master_contacts_export_complete'?response({ok:false,error:'Audit unavailable'},503):undefined});
  f.click(); await flush(); assert.equal(f.blobs.length,0); assert.match(f.nodes.wwQrMasterStatus.textContent,/Audit unavailable/);
});

test('network retry reuses start request identity and never releases an earlier partial download',async()=>{
  let fail=true;
  const f=fixture({respond:fields=>{if(fail&&fields.ww_qrbs_form_action==='master_contacts_export_page'){fail=false;throw new Error('Connection lost');}}});
  f.click(); await flush(); assert.equal(f.blobs.length,0); f.click(); await flush();
  const starts=f.requests.filter(r=>r.fields.ww_qrbs_form_action==='master_contacts_export_start');
  assert.equal(starts[0].fields.request_id,starts[1].fields.request_id); assert.equal(f.blobs.length,1);
});

test('expired or invalidated snapshot retries start fresh, and operator changes never reuse another operator request',async()=>{
  for(const [changedOperator,status] of [[false,410],[false,409],[true,410]]){
    let first=true;
    const f=fixture({respond:()=>{if(first){first=false;return response({ok:false,error:'Snapshot expired or invalidated'},status);}}});
    f.click(); await flush(); if(changedOperator)f.nodes.wwQrDataOperator.value='Another Admin'; f.click(); await flush();
    assert.notEqual(f.requests[0].fields.request_id,f.requests[1].fields.request_id); assert.equal(f.blobs.length,1);
  }
});
