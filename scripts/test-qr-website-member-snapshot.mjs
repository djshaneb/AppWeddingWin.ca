import {readFileSync} from "node:fs";
import assert from "node:assert/strict";
import {pathToFileURL} from "node:url";
import {resolve} from "node:path";
const moduleRoot=process.env.PHP_WASM_NODE_MODULES_ROOT
  ? pathToFileURL(resolve(process.env.PHP_WASM_NODE_MODULES_ROOT)+"/")
  : new URL("../node_modules/",import.meta.url);
const {PHP}=await import(new URL("@php-wasm/universal/index.js",moduleRoot));
const {loadNodeRuntime}=await import(new URL("@php-wasm/node/index.js",moduleRoot));
const source=readFileSync(new URL("../brilliant-directories/widgets/258-julian-qr-code-bingo.php",import.meta.url),"utf8");
const start="    /* WW_QR_FRESH_MEMBER_SNAPSHOT_START */",end="    /* WW_QR_FRESH_MEMBER_SNAPSHOT_END */";
const helper=source.slice(source.indexOf(start),source.indexOf(end)+end.length);
const runtime=new PHP(await loadNodeRuntime("7.4",{emscriptenOptions:{processId:process.pid}}));
try {
 const parsed=await runtime.run({code:"<?php token_get_all(base64_decode('"+Buffer.from(source).toString("base64")+"'), TOKEN_PARSE);echo 'OK';"});
 assert.equal(parsed.text,"OK",parsed.errors);
 assert.ok(source.indexOf("$requestBody['website_member_snapshot'] = $memberSnapshot")<source.indexOf("$rawBody = json_encode($requestBody)"));
 const code = `<?php
 class FakeRows { public $row; function __construct($row){$this->row=$row;} }
 $w=array('database'=>'test');$queries=array();$mode='normal';$metaRow=null;
 $fresh=array('user_id'=>'123','active'=>'2','subscription_id'=>'18','first_name'=>'Fresh','last_name'=>'Member','email'=>'fresh@example.test','phone_number'=>'9055551234','wedding_date'=>'2027-06-12','token'=>'NEVER_SEND','password'=>'NEVER_SEND','cookie'=>'NEVER_SEND');
 function mysql($database,$sql){ global $queries,$fresh,$metaRow,$mode;$queries[]=$sql;if($mode==='failed')return false;if(strpos($sql,'FROM users_meta')!==false){if($mode==='meta_failed')return false;return new FakeRows($metaRow);}return new FakeRows($fresh);}
 function mysql_fetch_assoc($rows){return $rows->row;}
 ${helper}
 $results=array();$results['normal']=ww_qrb_fresh_member_snapshot('123');
 $metaRow=array('value'=>'');$results['blank_meta']=ww_qrb_fresh_member_snapshot('123');
 $metaRow=array('value'=>'2028-04-05');$results['meta']=ww_qrb_fresh_member_snapshot('123');
 $mode='failed';$results['db_failed']=ww_qrb_fresh_member_snapshot('123');
 $mode='meta_failed';$results['meta_failed']=ww_qrb_fresh_member_snapshot('123');
 $mode='normal';$fresh['active']='1';$results['inactive']=ww_qrb_fresh_member_snapshot('123');
 $fresh['active']='2';$fresh['user_id']='124';$results['wrong_id']=ww_qrb_fresh_member_snapshot('123');
 $fresh['user_id']='123';$fresh['subscription_id']='17';$results['vendor']=ww_qrb_fresh_member_snapshot('123');
 $before=count($queries);$results['injection']=ww_qrb_fresh_member_snapshot("123' OR 1=1");$results['injection_query_count']=count($queries)-$before;
 $results['queries']=$queries;echo json_encode($results);
 `;
 const result=await runtime.run({code});assert.equal(result.errors,"",result.errors);
 const out=JSON.parse(result.text);
 assert.equal(out.normal.first_name,"Fresh");assert.equal(out.normal.email,"fresh@example.test");
 for(const key of ["token","cookie","password"]) assert.ok(!(key in out.normal));
 assert.equal(out.blank_meta.wedding_date,"");assert.equal(out.meta.wedding_date,"2028-04-05");
 for(const key of ["db_failed","meta_failed","inactive","wrong_id","vendor","injection"]) assert.equal(out[key],null,key);
 assert.equal(out.injection_query_count,0);
 assert.ok(out.queries.every(q=>q.includes("user_id='123'")||q.includes("database_id='123'")));
 const forbidden=source.slice(source.indexOf("        foreach (array('native_session'"),source.indexOf("        $memberId =",source.indexOf("        foreach (array('native_session'")));
 assert.ok(forbidden.includes("'website_member_snapshot'"));
 console.log("PASS full PHP 7.4 parse, fresh SQL precedence, whitelist secrecy, meta blank/shadow, failed reads, inactive/wrong-role/wrong-ID, injection, signed-attachment order");
} finally {runtime.exit();}

