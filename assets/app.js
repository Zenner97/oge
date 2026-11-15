/* OGE LAB 2027: интерактивный тренажёр */
(function(){'use strict';
const DATA=window.OGE_DATA, TRANSLATIONS=window.OGE_TRANSLATIONS;
const tr=w=>TRANSLATIONS[String(w||'').toLowerCase()]||'';
const icons={home:'<svg fill="none" stroke-width="2" viewBox="0 0 24 24"><path d="m3 10 9-7 9 7v10H3z"/><path d="M9 20v-7h6v7"/></svg>',grammar:'<svg fill="none" stroke-width="2" viewBox="0 0 24 24"><path d="M4 3h15v18H4z"/><path d="M8 7h7M8 11h7M8 15h4"/></svg>',lexicon:'<svg fill="none" stroke-width="2" viewBox="0 0 24 24"><path d="M4 5c3-2 6-2 8 0v15c-3-2-5-2-8 0zM12 5c2-2 5-2 8 0v15c-3-2-5-2-8 0z"/></svg>',families:'<span class="word-icon" aria-hidden="true">W</span>'};
const topics=[['home','Главная'],['grammar','Грамматика'],['lexicon','Лексика'],['families','Словообразование']];
const root=document.getElementById('oge-app'),content=document.getElementById('content');
let page='home',section='grammar',variant={grammar:1,lexicon:1},showVariantGrid=false,showAll=false,familyMode='list',search='',studyRevealed={},drillIndex=0,drillShown=false,drillFeedback='';
const storageKey='oge-progress-v1';let store={};try{const legacyKey='oge'+(2027-1)+'-progress-v1';store=JSON.parse(localStorage.getItem(storageKey)||localStorage.getItem(legacyKey)||'{}')||{}}catch(e){}
const esc=x=>String(x??'').replace(/[&<>"']/g,y=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[y]));
const clean=x=>String(x||'').normalize('NFKC').toLowerCase().trim().replace(/\s+/g,' ').replace(/[’‘]/g,"'").replace(/с/g,'c');
const variantKey=(kind,n)=>kind+'-'+n;
const row=(kind,n)=>DATA[kind][n-1];
const keyData=(kind,n)=>{const k=variantKey(kind,n);if(!store[k])store[k]={};return store[k]};
const persist=()=>{try{localStorage.setItem(storageKey,JSON.stringify(store))}catch(e){}};
const answersFor=x=>String(x||'').split(/\s+ИЛИ\s+|\s+или\s+|\s*\/\s*/i).map(clean);
const statusFor=(kind,n,i)=>{let state=keyData(kind,n),user=(state[i]||'').trim();return !user?'empty':answersFor(row(kind,n).a[i]).includes(clean(user))?'correct':'wrong'};
const countStats=()=>{let total=0,filled=0,correct=0;for(const kind of ['grammar','lexicon'])for(const v of DATA[kind]){total+=v.a.length;for(let i=0;i<v.a.length;i++){const st=statusFor(kind,v.n,i);if(st!=='empty')filled++;if(st==='correct')correct++}}return {total,filled,correct}};
function initNav(){for(const [target,id] of [['nav-desktop','navdesktop'],['nav-mobile','navmobile']])document.getElementById(target).innerHTML=topics.map(([id,label])=>`<button type="button" data-action="nav" data-page="${id}" class="${id===page?'active':''}">${icons[id]}<span>${label}</span></button>`).join('')}
function updateProgress(){let s=countStats();let p=Math.round(100*s.filled/s.total);document.getElementById('side-score').textContent=p+'%';document.getElementById('side-bar').style.width=p+'%';document.getElementById('side-sub').textContent=`${s.filled} из ${s.total} ответов введено · ${s.correct} верных`}
function setPage(name){page=name;showAll=false;showVariantGrid=false;render();window.scrollTo({top:0,behavior:'instant'})}
function home(){let s=countStats();return `<section class="hero"><div class="eyebrow">твоя подготовка начинается здесь</div><h1>Английский для ОГЭ.</h1></section><div class="heading"><h2>Выбери направление</h2></div><div class="cards"><article class="topic" data-action="nav" data-page="grammar"><div class="symbol purple">✎</div><h3>Грамматика</h3><p>Формы глаголов, степени сравнения, местоимения, числительные и другие задания ОГЭ.</p><footer><span>75 вариантов · 675 ответов</span><span>Начать →</span></footer></article><article class="topic" data-action="nav" data-page="lexicon"><div class="symbol cyan">Aa</div><h3>Лексика</h3><p>Контекстные задания на словообразование. Подбери правильную форму слова.</p><footer><span>75 вариантов</span><span>Начать →</span></footer></article><article class="topic" data-action="nav" data-page="families"><div class="symbol amber">W</div><h3>Словообразование</h3><p>Изучай словарные семьи, открывай формы и тренируй их написание на карточках.</p><footer><span>${DATA.families.length} словарных семей</span><span>Учить →</span></footer></article></div><div class="heading"><h2>Твой результат</h2></div><div class="statrow"><div class="stat"><b>${s.filled} / ${s.total}</b><small>Введено ответов</small></div><div class="stat"><b>${s.correct}</b><small>Правильных ответов</small></div><div class="stat"><b>${s.filled?Math.round(100*s.correct/s.filled):0}%</b><small>Точность ответов</small></div></div>`}
function variantClasses(kind,n){let v=row(kind,n),filled=0;for(let i=0;i<v.a.length;i++)if(statusFor(kind,n,i)!=='empty')filled++;return filled===v.a.length?'done':filled?'started':''}
function exerciseLine(kind,n,str,start){
 let cur=start, parts=str.split('〚GAP〛'), h='';
 const firstNumber=kind==='grammar'?20:29;
 for(let j=0;j<parts.length;j++){
   h+=esc(parts[j]).replace(/\b([A-Z]{2,}(?:\s+[A-Z]{2,})?)\s*$/g,(all,clue)=>'<span class="source-clue">'+clue+'</span>');
   if(j<parts.length-1){
     const i=cur++,value=keyData(kind,n)[i]||'',taskNo=firstNumber+i;
     // A few source paragraphs contain two gaps: give every gap its own OGE task number.
     if(j>0)h+=` <span class="task-inline-number" aria-label="Задание ${taskNo}">${taskNo}</span> `;
     h+=`<span class="answer" data-answer="${i}"><input autocomplete="off" autocapitalize="off" spellcheck="false" value="${esc(value)}" data-kind="${kind}" data-n="${n}" data-index="${i}" aria-label="Ответ на задание ${taskNo}"><button type="button" class="reveal" data-action="reveal" data-i="${i}" aria-label="Показать правильный ответ на задание ${taskNo}" title="Показать правильный ответ">?</button><span class="solution hide">${esc(row(kind,n).a[i])}</span></span>`;
   }
 }
 return [h,cur];
}
function renderPractice(kind){
 section=kind;
 const n=variant[kind],v=row(kind,n),st=keyData(kind,n);
 const count=v.a.length,filled=v.a.filter((_,i)=>String(st[i]||'').trim()).length,
       correct=v.a.filter((_,i)=>statusFor(kind,n,i)==='correct').length;
 const base=kind==='grammar'?20:29;
 let h=`<section class="panel exercise"><div class="exercise-head"><div><div class="exercise-meta">ЗАДАНИЕ ОГЭ · ${kind==='grammar'?'ГРАММАТИКА':'ЛЕКСИКА'}</div><strong>Вариант ${n}</strong></div></div>`;
 for(const note of v.notes)h+=`<div class="note">⚠ ${esc(note)}</div>`;
 let at=0;h+='<div class="exercise-body">';
 for(const paragraph of v.p){
   const before=at;let output;[output,at]=exerciseLine(kind,n,paragraph,at);
   // The source sometimes breaks a sentence into a separate paragraph without a new gap.
   // Show 20–28 for Grammar; for Lexicon use its OGE numbers 29–34.
   if(at>before)h+=`<p class="exercise-line"><span class="task-number">${base+before}</span><span class="exercise-copy">${output}</span></p>`;
   else h+=`<p class="exercise-line continuation"><span class="exercise-copy">${output}</span></p>`;
 }
 h+='</div>';
 h+=`<div class="practice-footer"><div class="actions"><button class="button primary" data-action="check">✓ Проверить ответы</button><button class="button" data-action="reveal-all">${showAll?'Скрыть ответы':'Показать все ответы'}</button><button class="button" data-action="reset">Очистить</button></div><div class="result" id="result"><strong>${correct} / ${count}</strong> верно · ${filled} заполнено</div></div>`;
 h+=`<p class="help">${kind==='grammar'?'Поставь слово в нужную грамматическую форму.':'Образуй новое слово по смыслу текста.'} После ответа нажми «Проверить ответы» или «?» рядом с пропуском. Проверка не учитывает регистр и лишние пробелы.</p></section>`;
 // Put the variant selector and previous/next navigation BELOW the whole exercise.
 h+=`<nav class="panel practice-controls practice-controls-bottom" aria-label="Навигация по вариантам"><span class="label">Вариант</span><select class="variant-select" id="variant-select" aria-label="Выбрать вариант">${DATA[kind].map((x)=>`<option value="${x.n}" ${x.n===n?'selected':''}>№ ${x.n}</option>`).join('')}</select><button class="button tiny" data-action="prev" ${n===1?'disabled':''}>← Пред.</button><button class="button tiny" data-action="next" ${n===DATA[kind].length?'disabled':''}>След. →</button></nav>`;
 return h;
}
function exerciseDecorate(){const kind=section,n=variant[kind];content.querySelectorAll('.answer').forEach(wrap=>{const i=Number(wrap.dataset.answer);let status=statusFor(kind,n,i);wrap.classList.toggle('correct',status==='correct');wrap.classList.toggle('wrong',status==='wrong' && wrap.dataset.checked==='yes');if(showAll){wrap.querySelector('.solution').classList.remove('hide');wrap.querySelector('.reveal').textContent='×'}else{wrap.querySelector('.solution').classList.add('hide');wrap.querySelector('.reveal').textContent='?'}})}
function refreshPracticeVisual(){let n=variant[section],v=row(section,n),filled=v.a.filter((_,i)=>String(keyData(section,n)[i]||'').trim()).length,correct=v.a.filter((_,i)=>statusFor(section,n,i)==='correct').length;let r=document.getElementById('result');if(r)r.innerHTML=`<strong>${correct} / ${v.a.length}</strong> верно · ${filled} заполнено`;updateProgress()}
function renderFamilies(){let filtered=DATA.families.filter(x=>(x.base+' '+x.forms.join(' ')+' '+x.forms.map(tr).join(' ')).toLowerCase().includes(search.toLowerCase()));let h=`<div class="page-title"><div><h1>Словообразование</h1><p>Изучай, какие формы образуются от одного слова. Все пары взяты из твоего списка.</p></div><span class="top-pill">${DATA.families.length} словарных семей</span></div><div class="family-controls"><input class="searchbox" id="family-search" value="${esc(search)}" placeholder="Поиск: care, success, happy…" aria-label="Найти слово"><div class="segment"><button data-action="mode" data-mode="list" class="${familyMode==='list'?'active':''}">Все формы</button><button data-action="mode" data-mode="cards" class="${familyMode==='cards'?'active':''}">Карточки</button><button data-action="mode" data-mode="drill" class="${familyMode==='drill'?'active':''}">Практика</button></div></div>`;
if(familyMode==='drill')return h+renderDrill();
h+=`<p style="color:#8c97aa;font-size:12px;margin:0 0 16px">Найдено: ${filtered.length}. ${familyMode==='cards'?'Нажми на карточку, чтобы открыть производные формы.':'Нажми на значок динамика, чтобы услышать произношение.'}</p><div class="family-grid">`;
for(const f of filtered){let ix=DATA.families.indexOf(f);let revealed=familyMode==='list'||!!studyRevealed[ix];h+=`<article class="family ${familyMode==='cards'?'compact':''}" ${familyMode==='cards'?`data-action="flip" data-fi="${ix}" tabindex="0" role="button"`:''}><div class="family-head"><span class="family-num">СЕМЬЯ ${String(ix+1).padStart(3,'0')}</span><button class="speak" data-action="speak" data-word="${esc(f.base)}" title="Слушать слово">♪</button></div><h3>${esc(f.base)}</h3><div class="family-translation">${esc(tr(f.base))}</div>${revealed?`<div class="family-forms">${f.forms.filter(w=>w!==f.base).map(w=>`<span class="wordchip"><b class="wordchip-en">${esc(w)}</b><span class="wordchip-ru">${esc(tr(w))}</span></span>`).join('')}</div>`:'<div class="family-back">Нажми, чтобы показать формы →</div>'}${revealed&&familyMode==='list'&&f.links.length>1?`<div class="family-links">${f.links.map(([a,b])=>`${esc(a)} → ${esc(b)}`).join(' · ')}</div>`:''}</article>`}
if(!filtered.length)h+='<div class="panel" style="padding:24px;color:#7b8498">Нет совпадений. Попробуй другое слово.</div>';h+='</div>';return h}
let drills=DATA.families.flatMap(f=>f.links.map(([base,to])=>({base,to}))).filter(x=>x.base!==x.to);
function renderDrill(){let d=drills[drillIndex%drills.length];return `<div class="drill"><div class="drill-label">ТРЕНИРОВКА СЛОВООБРАЗОВАНИЯ · ${drillIndex+1}</div><h2>${esc(d.base)}</h2><div class="arrow">↓</div><p>Вспомни слово, которое образуется от <b>${esc(d.base)}</b>.<br>Введи производную форму из изученного списка.</p><input id="drill-input" autocomplete="off" autocapitalize="off" spellcheck="false" placeholder="Введите производное слово"><div class="drill-output" id="drill-out">${drillShown?esc(drillFeedback):''}</div><div class="drill-actions"><button class="button primary" data-action="drill-check">Проверить</button><button class="button" data-action="drill-reveal">Показать ответ</button><button class="button" data-action="drill-next">Следующее →</button></div></div>`}
function render(){initNav();if(page==='home')content.innerHTML=home();else if(page==='families')content.innerHTML=renderFamilies();else{content.innerHTML=renderPractice(page);exerciseDecorate()}updateProgress()}
function markChecked(){content.querySelectorAll('.answer').forEach(w=>w.dataset.checked='yes');exerciseDecorate();refreshPracticeVisual()}
function alertToast(message){let out=document.getElementById('drill-out');if(out)out.textContent=message}
root.addEventListener('click',e=>{
 let target=e.target.closest('[data-action]');if(!target)return;let a=target.dataset.action;
 if(a==='theme'){let mode=target.dataset.theme;if(mode!=='light'&&mode!=='dark')return;document.documentElement.dataset.theme=mode;try{localStorage.setItem('oge-theme-v1',mode)}catch(e){};root.querySelectorAll('[data-action=theme]').forEach(btn=>btn.setAttribute('aria-pressed',String(btn.dataset.theme===mode)));return}
 if(a==='nav'){setPage(target.dataset.page);return}
 if(a==='prev'||a==='next'||a==='jump'){variant[section]=a==='jump'?Number(target.dataset.n):Math.max(1,Math.min(75,variant[section]+(a==='next'?1:-1)));showAll=false;render();window.scrollTo({top:0,behavior:'instant'});return}
 if(a==='grid'){showVariantGrid=!showVariantGrid;render();return}
 if(a==='check'){markChecked();return}
 if(a==='reveal-all'){showAll=!showAll;exerciseDecorate();return}
 if(a==='reset'){if(!confirm('Очистить ответы в этом варианте?'))return;store[variantKey(section,variant[section])]={};persist();showAll=false;render();return}
 if(a==='reveal'){let w=target.closest('.answer'),node=w.querySelector('.solution'),opened=!node.classList.contains('hide');node.classList.toggle('hide',opened);target.textContent=opened?'?':'×';return}
 if(a==='mode'){familyMode=target.dataset.mode;render();return}
 if(a==='flip'){let i=Number(target.dataset.fi);studyRevealed[i]=!studyRevealed[i];render();return}
 if(a==='speak'){e.stopPropagation();let t=target.dataset.word;if('speechSynthesis' in window){window.speechSynthesis.cancel();let u=new SpeechSynthesisUtterance(t);u.lang='en-GB';u.rate=.82;window.speechSynthesis.speak(u)}return}
 if(a==='drill-reveal'){drillShown=true;drillFeedback='Правильная форма: '+drills[drillIndex%drills.length].to+' — '+tr(drills[drillIndex%drills.length].to);alertToast(drillFeedback);return}
 if(a==='drill-check'){let text=clean(document.getElementById('drill-input')?.value),d=drills[drillIndex%drills.length];drillShown=true;drillFeedback=!text?'Сначала введи слово.':text===clean(d.to)?'✓ Верно! '+d.base+' → '+d.to:'Пока нет. Правильный ответ: '+d.to+' — '+tr(d.to);alertToast(drillFeedback);return}
 if(a==='drill-next'){drillIndex=(drillIndex+1)%drills.length;drillShown=false;drillFeedback='';render();document.getElementById('drill-input')?.focus();return}
});
root.addEventListener('input',e=>{let t=e.target;if(t.matches('input[data-kind]')){let kind=t.dataset.kind,n=Number(t.dataset.n),i=Number(t.dataset.index);keyData(kind,n)[i]=t.value;persist();let w=t.closest('.answer');w.classList.remove('correct','wrong');w.dataset.checked='no';refreshPracticeVisual()}if(t.id==='family-search'){search=t.value;let pos=t.selectionStart;content.innerHTML=renderFamilies();let box=document.getElementById('family-search');box.focus();box.setSelectionRange(pos,pos)}});
root.addEventListener('change',e=>{if(e.target.id==='variant-select'){variant[section]=Number(e.target.value);showAll=false;render();window.scrollTo({top:0,behavior:'instant'})}});
root.addEventListener('keydown',e=>{if(e.key==='Enter'&&e.target.matches('input[data-kind]')){e.preventDefault();let w=e.target.closest('.answer');w.dataset.checked='yes';w.classList.toggle('correct',statusFor(section,variant[section],Number(w.dataset.answer))==='correct');w.classList.toggle('wrong',statusFor(section,variant[section],Number(w.dataset.answer))==='wrong');let inputs=[...content.querySelectorAll('input[data-kind]')];let at=inputs.indexOf(e.target);if(at+1<inputs.length)inputs[at+1].focus();refreshPracticeVisual()}if(e.key==='Enter'&&e.target.id==='drill-input'){e.preventDefault();root.querySelector('[data-action="drill-check"]')?.click()}if((e.key==='Enter'||e.key===' ')&&e.target.dataset.action==='flip'){e.preventDefault();e.target.click()}});
root.querySelectorAll('[data-action=theme]').forEach(btn=>btn.setAttribute('aria-pressed',String(btn.dataset.theme===document.documentElement.dataset.theme)));
render();
})();
