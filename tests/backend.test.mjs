import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {DatabaseSync} from 'node:sqlite';
import Worker from '../worker/index.js';
import keys from '../worker/grading-keys.json' with {type:'json'};
import {normalizeTelegram,validTelegram,validPassword,grade} from '../worker/security.js';

function newDB(){
  const sqlite=new DatabaseSync(':memory:');
  sqlite.exec(readFileSync(new URL('../migrations/0001_accounts.sql',import.meta.url),'utf8'));
  const prepare=(sql,values=[])=>({
    bind(...args){return prepare(sql,args)},
    async first(){return sqlite.prepare(sql).get(...values)||null},
    async all(){return {results:sqlite.prepare(sql).all(...values)}},
    async run(){return sqlite.prepare(sql).run(...values)}
  });
  return {sqlite,api:{prepare}};
}
function req(path,method='GET',body,session,origin='https://oge.example'){
  const headers={'Accept':'application/json'};
  if(method!=='GET'){headers['Origin']=origin;headers['Content-Type']='application/json'}
  if(session)headers.Cookie=session;
  return new Request('https://oge.example'+path,{method,headers,body:body===undefined?undefined:JSON.stringify(body)});
}
function sessionOf(resp){return resp.headers.get('set-cookie')?.split(';')[0]||''}

const environment=()=>{const db=newDB();return {db,env:{DB:db.api,RATE_LIMIT_SECRET:'unit-test-pepper-never-deploy',ASSETS:{fetch:()=>new Response('site works')}}}};

test('username, password, answer validation',()=>{
 assert.equal(normalizeTelegram(' @Student_111 '),'student_111');
 assert.ok(validTelegram('study_learner'));assert.ok(!validTelegram('ab'));
 assert.ok(validPassword('superlongpassword!'));assert.ok(!validPassword('short'));
 assert.equal(grade('WAS SURFING','was surfing'),'correct');
 assert.equal(grade('had been / was','was'),'correct');
 assert.equal(grade('Had been',''), 'empty');
});

test('accounts: registration, session isolation, server-side grading, admin restriction, export and deletion',async()=>{
 const {env,db}=environment();
 let r=await Worker.fetch(req('/api/health'),env);assert.equal(r.status,200);assert.equal((await r.json()).ready,true);
 r=await Worker.fetch(req('/api/register','POST',{telegram:'@study_learner',password:'superlongpassword!'}),env);assert.equal(r.status,400);
 r=await Worker.fetch(req('/api/register','POST',{telegram:'@study_learner',password:'superlongpassword!',name:'',consent:true}),env);
 assert.equal(r.status,201);const userA=(await r.json()).user,sessionA=sessionOf(r);assert.equal(userA.name,'');assert.equal(userA.role,'student');assert.ok(sessionA.startsWith('oge_session='));assert.match(r.headers.get('set-cookie'),/HttpOnly; Secure; SameSite=Strict/);
 const dbUser=db.sqlite.prepare('SELECT * FROM users WHERE id=?').get(userA.id);
 assert.notEqual(dbUser.password_hash,'superlongpassword!');assert.ok(dbUser.password_salt.length>=32);
 r=await Worker.fetch(req('/api/register','POST',{telegram:'@another_learner',password:'another-very-long-password',name:'Иван',consent:true}),env);
 assert.equal(r.status,201);const userB=(await r.json()).user,sessionB=sessionOf(r);
 assert.equal((await (await Worker.fetch(req('/api/me','GET',undefined,sessionA),env)).json()).user.id,userA.id);
 assert.equal((await (await Worker.fetch(req('/api/me','GET',undefined,sessionB),env)).json()).user.id,userB.id);
 const answers=keys.grammar[0].map(x=>x.toLowerCase());
 r=await Worker.fetch(req('/api/attempts','POST',{kind:'grammar',variant:1,answers,durationSeconds:55},sessionA),env);
 assert.equal(r.status,200);let submitted=(await r.json()).attempt;assert.equal(submitted.total,keys.grammar[0].length);assert.equal(submitted.correct,keys.grammar[0].length);
 const row=db.sqlite.prepare('SELECT * FROM attempts WHERE user_id=?').get(userA.id);
 assert.ok(row);assert.ok(!row.items_json.includes(answers[0]));
 r=await Worker.fetch(req('/api/me/report','GET',undefined,sessionB),env);assert.equal((await r.json()).report.summary.attempts,0);
 r=await Worker.fetch(req('/api/admin/overview','GET',undefined,sessionA),env);assert.equal(r.status,403);
 db.sqlite.prepare("UPDATE users SET role='admin' WHERE id=?").run(userB.id);
 r=await Worker.fetch(req('/api/admin/overview','GET',undefined,sessionB),env);const overview=await r.json();assert.equal(overview.users.length,2);assert.ok(!JSON.stringify(overview).includes('password_hash'));
 r=await Worker.fetch(req('/api/admin/users/'+userA.id+'/report','GET',undefined,sessionB),env);assert.equal((await r.json()).report.summary.attempts,1);
 r=await Worker.fetch(req('/api/admin/users/'+userA.id+'/report','GET',undefined,sessionA),env);assert.equal(r.status,403);
 r=await Worker.fetch(req('/api/me/export','GET',undefined,sessionA),env);assert.equal((await r.json()).attempts.length,1);
 r=await Worker.fetch(req('/api/me','PATCH',{name:'Ученик'},sessionA),env);assert.equal((await r.json()).user.name,'Ученик');
 r=await Worker.fetch(req('/api/password','POST',{password:'superlongpassword!',newPassword:'a-new-very-secure-password'},sessionA),env);
 assert.equal(r.status,200);const newSessionA=sessionOf(r);
 r=await Worker.fetch(req('/api/me','GET',undefined,sessionA),env);assert.equal(r.status,401);
 r=await Worker.fetch(req('/api/me','DELETE',{password:'a-new-very-secure-password'},newSessionA),env);assert.equal(r.status,200);
 assert.equal(db.sqlite.prepare('SELECT COUNT(*) AS n FROM attempts').get().n,0);
 assert.equal(db.sqlite.prepare('SELECT COUNT(*) AS n FROM users').get().n,1);
});

test('cross-origin mutation is rejected',async()=>{
 const {env}=environment();const resp=await Worker.fetch(req('/api/register','POST',{telegram:'@study_learner',password:'superlongpassword!',consent:true},null,'https://attacker.example'),env);
 assert.equal(resp.status,403);
});
