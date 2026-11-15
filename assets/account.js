/* OGE LAB account UI. This file contains NO passwords, secrets, student records, or database credentials. */
(function(){'use strict';
const state={backend:'loading',user:null,view:'login',busy:false,message:'',error:false,report:null,admin:null,student:null,pending:0};
let redraw=()=>{};
const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const dt=v=>v?new Date(v*1000).toLocaleDateString('ru-RU',{day:'2-digit',month:'short',year:'numeric'}):'—';
const pct=(a,b)=>b?Math.round(100*a/b):0;
function notify(text,isError=false){state.message=text;state.error=isError;redraw()}
function update(){redraw()}
async function api(path,options={}){
  const headers={Accept:'application/json'};
  if(options.body!==undefined)headers['Content-Type']='application/json';
  const resp=await fetch('/api'+path,{...options,credentials:'same-origin',headers:{...headers,...options.headers},cache:'no-store'});
  const data=await resp.json().catch(()=>({}));
  if(!resp.ok)throw new Error(data.error||`Ошибка сервера (${resp.status})`);
  return data;
}
async function init(){
  try {
    const res=await api('/health');
    if(!res.ready)throw new Error('Сервер ещё не настроен');
    state.backend='ready';
    try{const info=await api('/me');state.user=info.user;await getReport()}catch(e){if(!/Войдите|401/.test(String(e.message))) console.info('No active session')}
  }catch{state.backend='unavailable'}
  update();
}
async function getReport(){if(!state.user)return;try{state.report=(await api('/me/report')).report}catch{state.report=null}}
async function refreshAdmin(){
  if(state.user?.role!=='admin')return;
  try{state.admin=await api('/admin/overview')}catch(e){notify(e.message,true)}
}
function heading(title,subtitle){return `<div class="page-title account-heading"><div><h1>${title}</h1><p>${subtitle}</p></div><span class="top-pill">ЛИЧНОЕ ПРОСТРАНСТВО</span></div>`}
function status(){return state.message?`<div class="account-message ${state.error?'error':''}" role="status">${esc(state.message)}</div>`:''}
function unavailable(){return heading('Личный кабинет','Закрытая статистика и личный прогресс')+`<section class="panel account-notice"><div class="account-symbol">🔒</div><h2>Защищённый сервер ещё не подключён</h2><p>Тренажёр работает, но регистрация и вход отключены, пока сайт не опубликован вместе с сервером и приватной базой данных. На GitHub Pages нельзя безопасно принимать пароли.</p><p>Никакие логины или пароли сейчас не собираются.</p><a href="./privacy.html">Как будут храниться данные</a></section>`}
function loading(){return heading('Личный кабинет','Сохранение результатов и личная статистика')+`<div class="panel account-notice">Проверяем подключение к защищённому серверу…</div>`}
function login(){const signup=state.view==='signup';return heading(signup?'Создать аккаунт':'Войти в кабинет','Твои результаты, отчёты и история тренировок')+`<div class="account-auth"><section class="panel account-form-box"><div class="account-tabs"><button type="button" data-action="account-mode" data-mode="login" class="${!signup?'selected':''}">Вход</button><button type="button" data-action="account-mode" data-mode="signup" class="${signup?'selected':''}">Регистрация</button></div>${status()}<form id="${signup?'account-register':'account-login'}" class="account-form">
<label>Telegram-ник <span class="required">*</span><input name="telegram" required type="text" inputmode="text" autocomplete="username" minlength="5" maxlength="33" placeholder="@username" spellcheck="false"></label>
${signup?`<label>Имя <span class="optional">(необязательно)</span><input name="name" type="text" maxlength="80" autocomplete="name" placeholder="Как к тебе обращаться"></label>`:''}
<label>Пароль <span class="required">*</span><input name="password" required type="password" autocomplete="${signup?'new-password':'current-password'}" minlength="${signup?12:1}" maxlength="128" placeholder="${signup?'Минимум 12 символов':'Твой пароль'}"></label>
${signup?`<label class="account-check"><input type="checkbox" name="consent" required><span>Согласен(на) с <a href="./privacy.html" target="_blank" rel="noopener">правилами обработки данных</a></span></label>`:''}
<button class="button primary account-submit" type="submit" ${state.busy?'disabled':''}>${state.busy?'Обрабатываем…':signup?'Зарегистрироваться':'Войти'}</button></form><p class="account-footnote">Telegram-ник используется как логин и <strong>не подтверждает владение Telegram-аккаунтом</strong>. Пароль не публикуется и не сохраняется в браузере.</p></section><aside class="panel account-intro"><div class="account-intro-icon">↗</div><h2>Учись и наблюдай за ростом</h2><p>Все проверенные задания попадут в твою историю. Увидишь динамику, точность, сложные номера и личные достижения.</p><div class="account-feature">✓ История попыток и ошибок</div><div class="account-feature">✓ Отчёты по грамматике и лексике</div><div class="account-feature">✓ Данные только для тебя и преподавателя</div></aside></div>`}
function metric(label,value,detail=''){return `<div class="account-metric"><span>${label}</span><strong>${value}</strong>${detail?`<small>${detail}</small>`:''}</div>`}
function bars(report){if(!report.daily.length)return '<p class="account-empty">Пока нет статистики. Реши вариант и нажми «Проверить ответы».</p>';const days=report.daily.slice(-14);const max=Math.max(1,...days.map(d=>d.attempts));return `<div class="account-chart" role="img" aria-label="Активность по дням">${days.map(d=>`<div class="account-day" title="${esc(dt(Date.parse(d.date+'T00:00:00Z')/1000))}: ${d.attempts} проверок"><div class="account-bar-track"><div class="account-bar" style="height:${Math.max(8,Math.round(100*d.attempts/max))}%"></div></div><small>${d.date.slice(8)}</small></div>`).join('')}</div><p class="account-chart-note">Число проверок по дням за последние две недели</p>`}
function reportHtml(report){if(!report)return '<div class="panel account-notice">Загружаем отчёт…</div>';
 const s=report.summary;
 return `<div class="account-metrics">${metric('Проверок',s.attempts,'За всё время')}${metric('Точность',s.accuracy+'%','По проверенным заданиям')}${metric('Правильных ответов',s.correct,'Из '+s.total)}${metric('Активных дней',s.activeDays,'С момента регистрации')}</div>
 <div class="account-report-grid"><section class="panel account-report"><h3>Активность</h3>${bars(report)}</section><section class="panel account-report"><h3>По разделам</h3>${report.byKind.map(k=>`<div class="account-kind"><div class="account-kind-row"><strong>${k.kind==='grammar'?'Грамматика':'Лексика'}</strong><span>${k.accuracy}% · ${k.attempts} пров.</span></div><div class="account-track"><span style="width:${k.accuracy}%"></span></div></div>`).join('')}</section></div>
 <div class="account-report-grid"><section class="panel account-report"><h3>Варианты, требующие повторения</h3>${report.weakVariants.length?`<div class="account-items">${report.weakVariants.slice(0,7).map(v=>`<div><span>${v.kind==='grammar'?'Грамматика':'Лексика'} · № ${v.variant}</span><b>${v.accuracy}%</b></div>`).join('')}</div>`:'<p class="account-empty">Пока нет результатов.</p>'}</section><section class="panel account-report"><h3>Где чаще ошибаешься</h3>${report.topErrors.length?`<div class="account-items">${report.topErrors.slice(0,7).map(v=>`<div><span>${v.kind==='grammar'?'Грамматика':'Лексика'} · задание ${v.task}</span><b>${v.count} ош.</b></div>`).join('')}</div>`:'<p class="account-empty">Ошибок пока нет.</p>'}</section></div>
 <section class="panel account-report"><h3>Последние проверки</h3>${report.recent.length?`<div class="account-history"><div class="account-history-head"><span>Дата</span><span>Раздел</span><span>Вариант</span><span>Результат</span></div>${report.recent.slice(0,15).map(a=>`<div class="account-history-row"><span>${dt(a.date)}</span><span>${a.kind==='grammar'?'Грамматика':'Лексика'}</span><span>№ ${a.variant}</span><b>${a.correct} / ${a.total}</b></div>`).join('')}</div>`:'<p class="account-empty">Проверок пока нет.</p>'}</section>`}
function profileForms(){return `<section class="panel account-profile-settings"><h3>Настройки профиля</h3><div class="account-settings-grid"><form id="account-name"><label>Отображаемое имя<input name="name" maxlength="80" value="${esc(state.user?.name||'')}" placeholder="Можно не указывать"></label><button type="submit" class="button" ${state.busy?'disabled':''}>Сохранить имя</button></form><form id="account-password"><label>Текущий пароль<input name="password" type="password" required autocomplete="current-password"></label><label>Новый пароль<input name="newPassword" type="password" required minlength="12" maxlength="128" autocomplete="new-password"></label><button type="submit" class="button" ${state.busy?'disabled':''}>Сменить пароль</button></form></div><div class="account-data-actions"><a class="button" href="/api/me/export">Скачать мои данные</a><button type="button" class="button danger" data-action="account-delete-view">Удалить аккаунт и результаты</button></div></section>`}
function dashboard(){const u=state.user;return heading('Личный кабинет',`@${esc(u.telegram.replace(/^@/,''))} · ${u.name?esc(u.name):'Ученик'} · регистрация ${dt(u.createdAt)}`)+`<div class="account-toolbar"><div class="account-pill">${u.role==='admin'?'Администратор':'Ученик'}</div><div class="account-buttons"><button class="button" data-action="account-refresh">Обновить</button>${u.role==='admin'?`<button class="button" data-action="account-admin">Ученики</button>`:''}<button class="button" data-action="account-logout">Выйти</button></div></div>${status()}${state.view==='settings'?profileForms():state.view==='delete'?`<section class="panel account-report"><h3>Удалить аккаунт?</h3><p>Профиль и все отчёты будут удалены без возможности восстановления. Введи пароль для подтверждения.</p><form id="account-delete" class="account-form"><label>Пароль<input name="password" required type="password" autocomplete="current-password"></label><button type="submit" class="button danger">Удалить навсегда</button><button type="button" data-action="account-dashboard" class="button">Отмена</button></form></section>`:state.view==='admin'&&u.role==='admin'?adminPanel():state.view==='student'&&u.role==='admin'?studentReport():reportHtml(state.report)}<div class="account-bottom-links"><button class="button" data-action="account-dashboard">Мой отчёт</button><button class="button" data-action="account-settings">Настройки</button><a class="button" href="./privacy.html">Конфиденциальность</a></div>`}
function adminPanel(){const a=state.admin;if(!a)return '<div class="panel account-notice">Загружаем список учеников…</div>';return `<div class="account-metrics">${metric('Аккаунтов',a.overview.users)}${metric('Учеников с попытками',a.overview.activeUsers)}${metric('Всего проверок',a.overview.attempts)}${metric('Общая точность',pct(a.overview.correct,a.overview.total)+'%')}</div><section class="panel account-report"><h3>Ученики <small>Только для администратора</small></h3><div class="account-student-list">${a.users.map(u=>`<button type="button" data-action="account-student" data-student="${esc(u.id)}"><span><b>${esc(u.name||u.telegram)}</b><small>${esc(u.telegram)}</small></span><span>${dt(u.lastLoginAt)} →</span></button>`).join('')}</div></section>`}
function studentReport(){if(!state.student)return '<div class="panel account-notice">Загружаем результаты ученика…</div>';return `<div class="account-toolbar"><h2>${esc(state.student.user.name||state.student.user.telegram)} <small>${esc(state.student.user.telegram)}</small></h2><button class="button" data-action="account-admin">Назад к ученикам</button></div>${reportHtml(state.student.report)}`}
function render(){if(state.backend==='loading')return loading();if(state.backend!=='ready')return unavailable();return state.user?dashboard():login()}
function loadState(){return state}
async function saveAttempt({kind,variant,answers,durationSeconds}){
  if(state.backend!=='ready'||!state.user)return;
  try{
    await api('/attempts',{method:'POST',body:JSON.stringify({kind,variant,answers,durationSeconds})});
    await getReport();update();
  }catch(e){console.warn('Result sync unavailable'); state.message='Не удалось сохранить попытку на сервере. Локальные ответы остались в браузере.';state.error=true;update()}
}
async function handleSubmit(e){
  if(!e.target.id.startsWith('account-'))return false;
  e.preventDefault();if(state.busy)return true;
  if(state.backend!=='ready')return true;
  const id=e.target.id,fields=new FormData(e.target);
  state.busy=true;state.message='';state.error=false;update();
  try{
    if(id==='account-login'||id==='account-register'){
      const signup=id==='account-register';
      const body={telegram:String(fields.get('telegram')||''),password:String(fields.get('password')||'')};
      if(signup){body.name=String(fields.get('name')||'');body.consent=fields.get('consent')==='on'}
      const data=await api(signup?'/register':'/login',{method:'POST',body:JSON.stringify(body)});
      state.user=data.user;state.report=null;state.view='dashboard';await getReport();
    }else if(id==='account-name'){
      const data=await api('/me',{method:'PATCH',body:JSON.stringify({name:String(fields.get('name')||'')})});state.user=data.user;notify('Имя обновлено');
    }else if(id==='account-password'){
      await api('/password',{method:'POST',body:JSON.stringify({password:String(fields.get('password')||''),newPassword:String(fields.get('newPassword')||'')})});notify('Пароль изменён. Другие сеансы завершены.');
    }else if(id==='account-delete'){
      await api('/me',{method:'DELETE',body:JSON.stringify({password:String(fields.get('password')||'')})});state.user=null;state.report=null;state.admin=null;state.view='login';notify('Аккаунт удалён. Данные профиля и отчётов удалены.');
    }
  }catch(error){state.message=error.message||'Не удалось выполнить действие';state.error=true}
  finally{state.busy=false;update()}
  return true;
}
async function handleClick(target){
  const action=target.dataset.action;
  if(!action?.startsWith('account-'))return false;
  if(action==='account-mode'){state.view=target.dataset.mode;state.message='';update();return true}
  if(action==='account-settings'){state.view='settings';state.message='';update();return true}
  if(action==='account-delete-view'){state.view='delete';update();return true}
  if(action==='account-dashboard'){state.view='dashboard';state.message='';await getReport();update();return true}
  if(action==='account-logout'){
    try{await api('/logout',{method:'POST',body:'{}'})}catch{}
    state.user=null;state.report=null;state.admin=null;state.view='login';state.message='';update();return true;
  }
  if(action==='account-refresh'){await getReport();if(state.view==='admin')await refreshAdmin();update();return true}
  if(action==='account-admin'){state.view='admin';state.student=null;await refreshAdmin();update();return true}
  if(action==='account-student'&&state.user?.role==='admin'){
    state.student=null;state.view='student';update();
    try{state.student=await api('/admin/users/'+encodeURIComponent(target.dataset.student)+'/report')}catch(e){state.message=e.message;state.error=true}
    update();return true;
  }
  return false;
}
window.OGEAccount={init,render,loadState,saveAttempt,handleSubmit,handleClick,subscribe(fn){redraw=fn}};
})();
