import KEYS from './grading-keys.json' with {type:'json'};
import {nowSeconds, token, userId, normalizeTelegram, validTelegram, validPassword, validName, sha256, newSalt, passwordHash, sameHex, grade} from './security.js';

const MAX_BODY = 16 * 1024;
const SESSION_AGE = 60 * 60 * 24 * 14;
const COOKIE = 'oge_session';
const commonHeaders = {'Cache-Control': 'no-store, private', 'Content-Type': 'application/json; charset=utf-8', 'X-Content-Type-Options':'nosniff', 'Referrer-Policy':'no-referrer', 'X-Frame-Options':'DENY'};
const json = (value, status = 200, extra = {}) => new Response(JSON.stringify(value), {status, headers:{...commonHeaders,...extra}});
const fail = (message, code=400) => json({error:message},code);
const showUser = (u) => ({id:u.id, telegram:'@'+u.telegram, name:u.display_name, role:u.role, createdAt:u.created_at, lastLoginAt:u.last_login_at});

function cookie(value, maxAge = SESSION_AGE) {
  return `${COOKIE}=${value}; Path=/api; HttpOnly; Secure; SameSite=Strict; Max-Age=${maxAge}`;
}
function sessionTokenFrom(req) {
  const raw=req.headers.get('Cookie')||'';
  const piece=raw.split(';').map(x=>x.trim()).find(x=>x.startsWith(COOKIE+'='));
  const value=piece?.slice(COOKIE.length+1)||'';
  return /^[A-Za-z0-9_-]{43}$/.test(value) ? value : null;
}
async function auth(req, db) {
  const tokenValue=sessionTokenFrom(req);
  if(!tokenValue)return null;
  const digest=await sha256(tokenValue);
  const u=await db.prepare('SELECT u.id,u.telegram,u.display_name,u.role,u.created_at,u.last_login_at FROM sessions s JOIN users u ON u.id=s.user_id WHERE s.token_hash=? AND s.expires_at>?').bind(digest,nowSeconds()).first();
  return u || null;
}
async function newSession(db, id) {
  const value=token(), at=nowSeconds();
  await db.prepare('INSERT INTO sessions(token_hash,user_id,created_at,expires_at) VALUES(?,?,?,?)').bind(await sha256(value),id,at,at+SESSION_AGE).run();
  return value;
}
async function readJSON(req) {
  if(Number(req.headers.get('content-length')||0)>MAX_BODY)throw Error('Слишком большой запрос');
  if(!(req.headers.get('content-type')||'').toLowerCase().startsWith('application/json'))throw Error('Ожидается JSON');
  const str=await req.text();
  if(str.length>MAX_BODY)throw Error('Слишком большой запрос');
  let parsed;try{parsed=JSON.parse(str)}catch{throw Error('Некорректный JSON')}
  if(!parsed||typeof parsed!=='object'||Array.isArray(parsed))throw Error('Некорректный запрос');
  return parsed;
}
async function rateLimit(req, env, keyPart, allowed=8, windowSeconds=900) {
  // Personal IP is NEVER stored: only a salted irreversible digest and TTL window.
  const ip=req.headers.get('CF-Connecting-IP')||'unknown';
  const key=await sha256(`${env.RATE_LIMIT_SECRET}|${ip}|${keyPart}`);
  const now=nowSeconds(),since=now-windowSeconds;
  const record=await env.DB.prepare('INSERT INTO rate_limits(rate_key, attempts, window_start) VALUES(?,1,?) ON CONFLICT(rate_key) DO UPDATE SET attempts = CASE WHEN window_start < ? THEN 1 ELSE attempts+1 END, window_start = CASE WHEN window_start < ? THEN excluded.window_start ELSE window_start END RETURNING attempts').bind(key,now,since,since).first();
  return record?.attempts>allowed;
}
function listReport(rows) {
  const kinds={grammar:{attempts:0,correct:0,total:0},lexicon:{attempts:0,correct:0,total:0}};
  const daily=new Map(),weak=new Map(),wrongTasks=new Map();let correct=0,total=0,filled=0;
  for(const a of rows){
    correct+=a.correct;total+=a.total;filled+=a.filled;
    kinds[a.kind].attempts++;kinds[a.kind].correct+=a.correct;kinds[a.kind].total+=a.total;
    const day=new Date(a.created_at*1000).toISOString().slice(0,10);
    if(!daily.has(day))daily.set(day,{date:day,attempts:0,correct:0,total:0});
    const dt=daily.get(day);dt.attempts++;dt.correct+=a.correct;dt.total+=a.total;
    const k=`${a.kind}-${a.variant_no}`;
    if(!weak.has(k))weak.set(k,{kind:a.kind,variant:a.variant_no,attempts:0,correct:0,total:0});
    const v=weak.get(k);v.attempts++;v.correct+=a.correct;v.total+=a.total;
    let items=[];try{items=JSON.parse(a.items_json)}catch{}
    items.forEach((s,i)=>{if(s==='wrong'){const number=i+(a.kind==='grammar'?20:29),key=a.kind+':'+number;wrongTasks.set(key,(wrongTasks.get(key)||0)+1)}});
  }
  const percent=(a,b)=>b?Math.round(100*a/b):0;
  return {summary:{attempts:rows.length,correct,total,filled,accuracy:percent(correct,total),activeDays:daily.size},byKind:Object.entries(kinds).map(([kind,v])=>({...v,kind,accuracy:percent(v.correct,v.total)})),daily:[...daily.values()].sort((a,b)=>a.date.localeCompare(b.date)).slice(-30),weakVariants:[...weak.values()].filter(x=>x.total).map(x=>({...x,accuracy:percent(x.correct,x.total)})).sort((a,b)=>a.accuracy-b.accuracy||b.attempts-a.attempts).slice(0,8),topErrors:[...wrongTasks.entries()].map(([key,count])=>({kind:key.split(':')[0],task:Number(key.split(':')[1]),count})).sort((a,b)=>b.count-a.count).slice(0,10),recent:rows.slice(0,30).map(a=>({id:a.id,kind:a.kind,variant:a.variant_no,correct:a.correct,total:a.total,filled:a.filled,duration:a.duration_seconds,date:a.created_at,items:JSON.parse(a.items_json)}))};
}
async function history(db,uid,limit=500) {return (await db.prepare('SELECT id,kind,variant_no,correct,total,filled,duration_seconds,items_json,created_at FROM attempts WHERE user_id=? ORDER BY created_at DESC LIMIT ?').bind(uid,limit).all()).results||[];}
async function myReport(db,uid) {return listReport(await history(db,uid));}

async function route(req,env,url) {
  const db=env.DB,method=req.method,path=url.pathname;
  if(path==='/api/health'&&method==='GET'){
    if(!db||!env.RATE_LIMIT_SECRET)return json({ready:false},503);
    try{await db.prepare('SELECT id FROM users LIMIT 1').first();return json({ready:true})}
    catch{return json({ready:false},503)}
  }
  if(!db||!env.RATE_LIMIT_SECRET)return fail('Сервер аккаунтов не настроен',503);
  if(!['GET','HEAD'].includes(method) && req.headers.get('Origin')!==url.origin) return fail('Запрос с другого сайта запрещён',403);
  if(path==='/api/register'&&method==='POST'){
    if(await rateLimit(req,env,'register',5))return fail('Слишком много попыток. Повторите позднее.',429);
    const body=await readJSON(req),handle=normalizeTelegram(body.telegram),name=String(body.name||'').trim();
    if(!validTelegram(handle))return fail('Укажи действительный Telegram-ник: 5–32 символа (латиница, цифры, _).');
    if(!validPassword(body.password))return fail('Пароль должен содержать 12–128 символов.');
    if(!validName(name))return fail('Имя слишком длинное или содержит недопустимые символы.');
    if(body.consent!==true)return fail('Необходимо согласие на обработку данных.');
    if(await db.prepare('SELECT id FROM users WHERE telegram=?').bind(handle).first())return fail('Этот ник уже зарегистрирован.',409);
    const id=userId(),salt=newSalt(),hash=await passwordHash(body.password,salt),at=nowSeconds();
    try{await db.prepare('INSERT INTO users(id,telegram,display_name,password_salt,password_hash,role,consent_at,created_at,last_login_at) VALUES(?,?,?,?,?,?,?,?,?)').bind(id,handle,name,salt,hash,'student',at,at,at).run()}
    catch(e){if(String(e).includes('UNIQUE'))return fail('Этот ник уже зарегистрирован.',409);throw e}
    const st=await newSession(db,id);
    return json({user:{id,telegram:'@'+handle,name,role:'student',createdAt:at,lastLoginAt:at}},201,{'Set-Cookie':cookie(st)});
  }
  if(path==='/api/login'&&method==='POST'){
    const body=await readJSON(req),handle=normalizeTelegram(body.telegram);
    if(!validTelegram(handle)||typeof body.password!=='string')return fail('Неверный ник или пароль',401);
    if(await rateLimit(req,env,'login:'+handle,8))return fail('Слишком много попыток. Повторите через 15 минут.',429);
    const u=await db.prepare('SELECT * FROM users WHERE telegram=?').bind(handle).first();
    // Always compute a real slow hash to avoid leaking whether the username exists.
    const salt=u?.password_salt||'d4'.repeat(16);
    const hash=await passwordHash(body.password.slice(0,1024),salt);
    if(!u||!sameHex(hash,u.password_hash))return fail('Неверный ник или пароль',401);
    const at=nowSeconds();await db.prepare('UPDATE users SET last_login_at=? WHERE id=?').bind(at,u.id).run();
    const st=await newSession(db,u.id);
    return json({user:showUser({...u,last_login_at:at})},200,{'Set-Cookie':cookie(st)});
  }
  const u=await auth(req,db);
  if(!u)return fail('Войдите в личный кабинет',401);
  if(path==='/api/logout'&&method==='POST'){
    const t=sessionTokenFrom(req);if(t)await db.prepare('DELETE FROM sessions WHERE token_hash=?').bind(await sha256(t)).run();
    return json({ok:true},200,{'Set-Cookie':cookie('',0)});
  }
  if(path==='/api/me'&&method==='GET')return json({user:showUser(u)});
  if(path==='/api/me'&&method==='PATCH'){
    const body=await readJSON(req),name=String(body.name||'').trim();if(!validName(name))return fail('Недопустимое имя');
    await db.prepare('UPDATE users SET display_name=? WHERE id=?').bind(name,u.id).run();return json({user:showUser({...u,display_name:name})});
  }
  if(path==='/api/password'&&method==='POST'){
    const b=await readJSON(req);if(!validPassword(b.newPassword))return fail('Новый пароль должен содержать от 12 до 128 символов');
    const row=await db.prepare('SELECT password_salt,password_hash FROM users WHERE id=?').bind(u.id).first();
    if(typeof b.password!=='string'||!sameHex(await passwordHash(b.password,row.password_salt),row.password_hash))return fail('Текущий пароль неверен',401);
    const salt=newSalt(),hash=await passwordHash(b.newPassword,salt);
    await db.prepare('UPDATE users SET password_hash=?,password_salt=? WHERE id=?').bind(hash,salt,u.id).run();
    await db.prepare('DELETE FROM sessions WHERE user_id=?').bind(u.id).run();
    const st=await newSession(db,u.id);return json({ok:true},200,{'Set-Cookie':cookie(st)});
  }
  if(path==='/api/me'&&method==='DELETE'){
    const b=await readJSON(req);const row=await db.prepare('SELECT password_salt,password_hash FROM users WHERE id=?').bind(u.id).first();
    if(typeof b.password!=='string'||!sameHex(await passwordHash(b.password,row.password_salt),row.password_hash))return fail('Пароль неверен',401);
    // Delete children explicitly as well to avoid relying on database FK configuration.
    await db.prepare('DELETE FROM attempts WHERE user_id=?').bind(u.id).run();
    await db.prepare('DELETE FROM sessions WHERE user_id=?').bind(u.id).run();
    await db.prepare('DELETE FROM users WHERE id=?').bind(u.id).run();
    return json({ok:true},200,{'Set-Cookie':cookie('',0)});
  }
  if(path==='/api/attempts'&&method==='POST'){
    if(await rateLimit(req,env,'attempt:'+u.id,80,900))return fail('Слишком частые проверки',429);
    const b=await readJSON(req),kind=b.kind,n=Number(b.variant);
    if(!['grammar','lexicon'].includes(kind)||!Number.isInteger(n)||n<1||n>75)return fail('Неизвестный вариант');
    const expected=KEYS[kind][n-1],given=b.answers;
    if(!Array.isArray(given)||given.length!==expected.length||given.some(v=>typeof v!=='string'||v.length>250))return fail('Неправильное количество ответов');
    const items=expected.map((a,i)=>grade(a,given[i]));
    const filled=items.filter(x=>x!=='empty').length,correct=items.filter(x=>x==='correct').length,at=nowSeconds(),id=userId();
    const duration=Number.isFinite(b.durationSeconds)?Math.min(6*3600,Math.max(0,Math.floor(b.durationSeconds))):null;
    await db.prepare('INSERT INTO attempts(id,user_id,kind,variant_no,filled,correct,total,duration_seconds,items_json,created_at) VALUES(?,?,?,?,?,?,?,?,?,?)').bind(id,u.id,kind,n,filled,correct,expected.length,duration,JSON.stringify(items),at).run();
    return json({saved:true,attempt:{id,kind,variant:n,filled,correct,total:expected.length,date:at,items}});
  }
  if(path==='/api/me/report'&&method==='GET')return json({report:await myReport(db,u.id)});
  if(path==='/api/me/export'&&method==='GET'){
    const all=await db.prepare('SELECT id,kind,variant_no,correct,total,filled,duration_seconds,items_json,created_at FROM attempts WHERE user_id=? ORDER BY created_at DESC').bind(u.id).all();
    return json({profile:showUser(u),attempts:(all.results||[]).map(a=>({...a,items:JSON.parse(a.items_json),items_json:undefined}))},200,{'Content-Disposition':'attachment; filename="oge-lab-data.json"'});
  }
  if(path.startsWith('/api/admin/')){
    if(u.role!=='admin')return fail('Доступ только для администратора',403);
    if(path==='/api/admin/overview'&&method==='GET'){
      const users=(await db.prepare("SELECT id,telegram,display_name,created_at,last_login_at,role FROM users ORDER BY created_at DESC LIMIT 1000").all()).results||[];
      const sums=(await db.prepare('SELECT COUNT(*) AS attempts,COALESCE(SUM(correct),0) AS correct,COALESCE(SUM(total),0) AS total,COUNT(DISTINCT user_id) AS active_users FROM attempts').first())||{};
      const allUsers=(await db.prepare('SELECT COUNT(*) AS n FROM users').first())||{n:0};
      return json({overview:{users:allUsers.n||0,activeUsers:sums.active_users||0,attempts:sums.attempts||0,correct:sums.correct||0,total:sums.total||0},users:users.map(showUser)});
    }
    const match=path.match(/^\/api\/admin\/users\/([0-9a-f-]{36})\/report$/);
    if(match&&method==='GET'){
      const student=await db.prepare('SELECT id,telegram,display_name,role,created_at,last_login_at FROM users WHERE id=?').bind(match[1]).first();
      if(!student)return fail('Ученик не найден',404);
      return json({user:showUser(student),report:await myReport(db,student.id)});
    }
  }
  return fail('Адрес API не найден',404);
}
export default {
  async fetch(req,env) {
    const url=new URL(req.url);
    if(!url.pathname.startsWith('/api/'))return env.ASSETS.fetch(req);
    try {
      // API is same-origin only: no CORS headers, and mutations require an exact Origin.
      return await route(req,env,url);
    } catch(e) {
      if(e?.message==='Некорректный JSON'||e?.message==='Слишком большой запрос'||e?.message==='Ожидается JSON'||e?.message==='Некорректный запрос')return fail(e.message);
      console.error('API request failed',String(e?.name||'Error')); // Never log passwords, cookies or user data.
      return fail('Ошибка сервера. Попробуйте позднее.',500);
    }
  }
};
