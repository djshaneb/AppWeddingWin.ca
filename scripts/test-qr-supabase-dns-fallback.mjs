import assert from 'node:assert/strict';
import test from 'node:test';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, realpathSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
const helper=readFileSync(new URL('../brilliant-directories/widgets/qr-supabase-dns-fallback.php',import.meta.url),'utf8').replace(/^<\?php\s*/, '');
const host='pszcjoyabwvzsxxjtkhs.supabase.co';
const url=`https://${host}/functions/v1/bd-qr-bingo-admin`;
const good={Status:0,TC:false,Question:[{name:host+'.',type:1}],Answer:[{name:host+'.',type:1,TTL:60,data:'104.18.38.10'}]};
test('BD snippet is unchanged by stripslashes and uses PHP 7.2-compatible syntax',()=>{assert.equal(helper.includes(String.fromCharCode(92)),false);assert.equal(helper.includes('fn('),false);assert.equal(helper.includes('?->'),false);});
const b64=v=>Buffer.from(JSON.stringify(v)).toString('base64');
function run(options={}){
 const input={url,effective:url,first:false,errno:6,second:'{"ok":true}',secondErrno:0,dns:JSON.stringify(good),dnsHttp:200,dnsErrno:0,...options};
 const dir=mkdtempSync(join(realpathSync(tmpdir()),'ww-dns-php-'));
 try{
  const file=join(dir,'test.php');
  writeFileSync(file,`<?php
namespace DnsQa;
$input=json_decode(base64_decode('${b64(input)}'),true);$handles=array();$calls=array();
foreach(array('CURLOPT_HTTPGET','CURLOPT_HTTPHEADER','CURLOPT_FOLLOWLOCATION','CURLOPT_PROTOCOLS','CURLPROTO_HTTPS','CURLOPT_SSL_VERIFYPEER','CURLOPT_SSL_VERIFYHOST','CURLOPT_CONNECTTIMEOUT','CURLOPT_TIMEOUT','CURLOPT_WRITEFUNCTION','CURLOPT_RESOLVE','CURLINFO_EFFECTIVE_URL','CURLINFO_HTTP_CODE','CURLOPT_COOKIE') as $i=>$name) if(!defined($name)) define($name,1000+$i);
function curl_init($url){global $handles;$h=(object)array('url'=>$url,'options'=>array(),'errno'=>0,'calls'=>0,'closed'=>false);$handles[]=$h;return $h;}
function curl_setopt_array($h,$options){global $input;$h->options=$options+$h->options;return empty($input['setoptFail']) || $h->url!==$input['url'];}
function curl_exec($h){global $input,$calls;$h->calls++;$calls[]=$h->url;
 if(strpos($h->url,'https://1.1.1.1/')===0){$h->errno=$input['dnsErrno'];$fn=$h->options[CURLOPT_WRITEFUNCTION];foreach(str_split($input['dns'],4096) as $chunk)if($fn($h,$chunk)!==strlen($chunk)){$h->errno=23;return false;}return $h->errno ? false : true;}
 $h->errno=$h->calls===1 ? $input['errno'] : $input['secondErrno'];return $h->calls===1 ? $input['first'] : $input['second'];}
function curl_errno($h){return $h->errno;}
function curl_getinfo($h,$option){global $input;return $option===CURLINFO_EFFECTIVE_URL ? $input['effective'] : $input['dnsHttp'];}
function curl_close($h){$h->closed=true;}
${helper}
$original=curl_init($input['url']);$original->options=array(CURLOPT_HTTPHEADER=>array('Authorization: Bearer synthetic-secret','X-Signature: synthetic'),CURLOPT_COOKIE=>'synthetic-cookie',CURLOPT_SSL_VERIFYPEER=>true,CURLOPT_SSL_VERIFYHOST=>2);
$result=ww_qr_supabase_curl_exec($original,$input['url']);
$out=array('result'=>$result,'calls'=>$calls,'original_calls'=>$original->calls,'errno'=>$original->errno,'original_headers'=>$original->options[CURLOPT_HTTPHEADER],'original_cookie'=>$original->options[CURLOPT_COOKIE],'resolve'=>isset($original->options[CURLOPT_RESOLVE])?$original->options[CURLOPT_RESOLVE]:null,'original_tls'=>array($original->options[CURLOPT_SSL_VERIFYPEER],$original->options[CURLOPT_SSL_VERIFYHOST]));
if(count($handles)>1){$dns=$handles[1];$out['dns']=array('closed'=>$dns->closed,'headers'=>$dns->options[CURLOPT_HTTPHEADER],'cookie'=>isset($dns->options[CURLOPT_COOKIE]),'tls'=>array($dns->options[CURLOPT_SSL_VERIFYPEER],$dns->options[CURLOPT_SSL_VERIFYHOST]),'follow'=>$dns->options[CURLOPT_FOLLOWLOCATION],'protocol'=>$dns->options[CURLOPT_PROTOCOLS]===CURLPROTO_HTTPS,'timeouts'=>array($dns->options[CURLOPT_CONNECTTIMEOUT],$dns->options[CURLOPT_TIMEOUT]));}
echo json_encode($out);`);
  return JSON.parse(execFileSync(process.execPath,[fileURLToPath(new URL('../node_modules/@php-wasm/cli/php-wasm.js',import.meta.url)),file],{encoding:'utf8',timeout:60000,maxBuffer:1024*1024}));
 }finally{rmSync(dir,{recursive:true,force:true});}
}
test('exact pre-connect DNS failure resolves fresh public A and retries same protected request once',()=>{
 const r=run();assert.equal(r.result,'{"ok":true}');assert.equal(r.original_calls,2);
 assert.deepEqual(r.calls,[url,`https://1.1.1.1/dns-query?name=${host}&type=A`,url]);
 assert.deepEqual(r.resolve,[`${host}:443:104.18.38.10`]);assert.deepEqual(r.original_tls,[true,2]);
 assert.deepEqual(r.original_headers,['Authorization: Bearer synthetic-secret','X-Signature: synthetic']);assert.equal(r.original_cookie,'synthetic-cookie');
 assert.deepEqual(r.dns,{closed:true,headers:['Accept: application/dns-json'],cookie:false,tls:[true,2],follow:false,protocol:true,timeouts:[3,5]});
});
test('success, HTTP errors, TLS failures, connect failures and timeouts are never replayed',()=>{
 for(const input of [{first:'{"ok":false}',errno:0},{first:'',errno:0},{errno:28},{errno:7},{errno:60},{errno:5},{errno:22}]){
  const r=run(input);assert.equal(r.calls.length,1);assert.equal(r.result,input.first??false);assert.equal(r.resolve,null);assert.equal(r.dns,undefined);assert.deepEqual(r.original_headers,['Authorization: Bearer synthetic-secret','X-Signature: synthetic']);assert.equal(r.original_cookie,'synthetic-cookie');assert.deepEqual(r.original_tls,[true,2]);
 }
});
test('wrong origins, credentials, ports, malformed URLs and redirected effective URLs cannot use fallback',()=>{
 for(const value of ['http://'+host+'/x','https://evil.example/x','https://'+host+'.evil.example/x','https://'+host+':444/x','https://u:p@'+host+'/x','https://'+host+'/x#f','https://'+host+'\\@evil.example/x','https://'+host+'/x\n']){
  const r=run({url:value,effective:value});assert.equal(r.calls.length,1,value);
 }
 assert.equal(run({effective:'https://evil.example/'}).calls.length,1);
});
test('only address reached from exact DNS question through a bounded unambiguous CNAME chain is usable',()=>{
 const dns={...good,Answer:[{name:host,type:5,data:'alias.example.'},{name:'unrelated.example',type:1,data:'1.1.1.1'},{name:'alias.example.',type:1,data:'104.18.38.10'}]};
 assert.deepEqual(run({dns:JSON.stringify(dns)}).resolve,[`${host}:443:104.18.38.10`]);
 for(const d of [{...good,Question:[{name:'evil.example',type:1}]},{...good,Question:[{name:host,type:28}]},{...good,Answer:[{name:'unrelated.example',type:1,data:'1.1.1.1'}]},{...good,Answer:[{name:host,type:5,data:'alias.example'},{name:'alias.example',type:5,data:host}]},{...good,Answer:[...good.Answer,{name:host,type:5,data:'alias.example'}]},{...good,Question:[{name:host+'..',type:1}]}]) assert.equal(run({dns:JSON.stringify(d)}).original_calls,1);
});
test('private, shared, loopback, link-local, documentation, multicast and reserved addresses fail closed',()=>{
 for(const ip of ['127.0.0.1','10.1.2.3','172.16.0.1','192.168.0.1','169.254.1.2','100.64.0.1','192.0.0.1','192.0.2.3','198.18.0.1','198.51.100.1','203.0.113.1','224.0.0.1','255.255.255.255','0.0.0.0','::1','0177.0.0.1','2130706433']){
  assert.equal(run({dns:JSON.stringify({...good,Answer:[{name:host,type:1,data:ip}]})}).original_calls,1,ip);
 }
});
test('malformed, truncated, oversized or failed resolver replies preserve original failure without retry',()=>{
 for(const v of [{dns:'{'},{dns:'x'.repeat(16385)},{dns:JSON.stringify({...good,Status:3})},{dns:JSON.stringify({...good,TC:true})},{dns:JSON.stringify({...good,Answer:Array(33).fill(good.Answer[0])})},{dnsHttp:302},{dnsHttp:503},{dnsErrno:60}]){
  const r=run(v);assert.equal(r.result,false);assert.equal(r.original_calls,1);assert.equal(r.dns.closed,true);
 }
});
test('a failed retried request or CURLOPT_RESOLVE setup never causes a third request',()=>{
 const r=run({second:false,secondErrno:6});assert.equal(r.result,false);assert.equal(r.original_calls,2);assert.equal(r.errno,6);
 assert.equal(run({setoptFail:true}).original_calls,1);
});
