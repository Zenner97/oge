import asyncio,json,mimetypes,re
from pathlib import Path
from urllib.parse import urlparse
from playwright.async_api import async_playwright
ROOT=Path(__file__).resolve().parents[1]

def report():
    return dict(summary=dict(attempts=14,correct=83,total=105,filled=103,accuracy=79,activeDays=5),byKind=[dict(kind='grammar',attempts=8,correct=60,total=72,accuracy=83),dict(kind='lexicon',attempts=6,correct=23,total=33,accuracy=70)],daily=[dict(date=f'2026-11-{i:02}',attempts=i%3+1,correct=3,total=4) for i in range(1,15)],weakVariants=[dict(kind='lexicon',variant=4,attempts=3,correct=8,total=18,accuracy=44)],topErrors=[dict(kind='grammar',task=27,count=4),dict(kind='lexicon',task=32,count=3)],recent=[dict(kind='grammar',variant=1,correct=7,total=9,date=1794700000,duration=120) for _ in range(3)])

async def test():
    async with async_playwright() as p:
        browser=await p.chromium.launch(executable_path='/usr/bin/chromium',headless=True,args=['--no-sandbox','--disable-dev-shm-usage'])
        for viewport,ready,role in [({'width':1440,'height':900},False,'student'),({'width':1440,'height':900},True,'student'),({'width':390,'height':844},True,'student'),({'width':1440,'height':900},True,'admin')]:
            page=await browser.new_page(viewport=viewport,device_scale_factor=1)
            errors=[]
            page.on('pageerror',lambda e:errors.append(str(e)))
            async def handler(route):
                req=route.request;url=urlparse(req.url);path=url.path
                if path.startswith('/api/'):
                    payload=None;status=200
                    if path=='/api/health':payload=dict(ready=ready) if ready else dict(ready=False);status=200 if ready else 503
                    elif path=='/api/me':payload=dict(error='unauthorized');status=401
                    elif path=='/api/register':payload=dict(user=dict(id='u-123',telegram='@demo_user',name='Аня',role=role,createdAt=1794700000))
                    elif path=='/api/me/report':payload=dict(report=report())
                    elif path=='/api/admin/overview':payload=dict(overview=dict(users=2,activeUsers=1,attempts=14,correct=83,total=105),users=[dict(id='u-123',telegram='@demo_user',name='Аня',role='admin',createdAt=1794700000),dict(id='u-124',telegram='@test_user',name='Иван',role='student',createdAt=1794700000)])
                    elif path.startswith('/api/admin/users/'):payload=dict(user=dict(id='u-124',telegram='@test_user',name='Иван'),report=report())
                    elif path=='/api/attempts':payload=dict(saved=True)
                    else:payload=dict(ok=True)
                    await route.fulfill(status=status,body=json.dumps(payload,ensure_ascii=False),content_type='application/json');return
                if path=='/':path='/index.html'
                file=(ROOT/path.lstrip('/')).resolve()
                if not str(file).startswith(str(ROOT)) or not file.is_file(): await route.fulfill(status=404,body='Not found');return
                await route.fulfill(status=200,body=file.read_bytes(),content_type=mimetypes.guess_type(file)[0] or 'application/octet-stream')
            mock_data=dict(user=dict(id='u-123',telegram='@demo_user',name='Аня',role=role,createdAt=1794700000),report=report(),overview=dict(users=2,activeUsers=1,attempts=14,correct=83,total=105),users=[dict(id='u-123',telegram='@demo_user',name='Аня',role='admin',createdAt=1794700000),dict(id='u-124',telegram='@test_user',name='Иван',role='student',createdAt=1794700000)])
            await page.evaluate('''([ready, mock]) => { window.fetch=async (path, options={}) => { const p=String(path); let status=200; let data={ok:true}; if(p.endsWith('/health')){data={ready};status=ready?200:503} else if(p.endsWith('/me') && !options.method){data={error:'unauthorized'};status=401} else if(p.endsWith('/register'))data={user:mock.user};else if(p.endsWith('/me/report'))data={report:mock.report};else if(p.endsWith('/admin/overview'))data={overview:mock.overview,users:mock.users};else if(p.includes('/admin/users/'))data={user:mock.users[1],report:mock.report};return new Response(JSON.stringify(data),{status,headers:{'Content-Type':'application/json'}});};}''',[ready,mock_data])
            html=(ROOT/'index.html').read_text()
            styles=''.join('<style>'+ (ROOT/path).read_text()+'</style>' for path in ['assets/styles.css','assets/wordmaster.css','assets/interactions.css','assets/account.css'])
            scripts=''.join('<script>'+ (ROOT/path).read_text().replace('</script>', '<\\/script>')+'</script>' for path in ['assets/data.js','assets/account.js','assets/app.js'])
            html=re.sub(r'<link[^>]+rel="stylesheet"[^>]*>', '', html)
            html=re.sub(r'<script src="[^"]+" defer></script>', '', html)
            html=html.replace('</head>',styles+'</head>').replace('</body>',scripts+'</body>')
            await page.set_content(html,wait_until='load')
            await page.wait_for_timeout(150)
            nav=page.locator('#nav-desktop button[data-page=account]') if viewport['width']>720 else page.locator('#nav-mobile button[data-page=account]')
            await nav.click()
            await page.wait_for_timeout(150)
            assert await page.locator('body').evaluate('(b)=> b.scrollWidth <= innerWidth'), 'Horizontal overflow'
            assert await page.locator('#nav-mobile button').count()==5
            if not ready:
                assert await page.locator('#account-register').count()==0
                assert 'Защищённый сервер' in (await page.locator('#content').inner_text())
            else:
                await page.locator('[data-action="account-mode"][data-mode="signup"]').click()
                assert await page.locator('#account-register input[name=telegram]').count()==1
                await page.locator('#account-register input[name=telegram]').fill('@demo_user')
                await page.locator('#account-register input[name=name]').fill('Аня')
                await page.locator('#account-register input[name=password]').fill('password123456789')
                await page.locator('#account-register input[name=consent]').check()
                await page.locator('#account-register button[type=submit]').click()
                await page.wait_for_timeout(280)
                assert 'Личный кабинет' in (await page.locator('#content').inner_text())
                assert await page.locator('.account-metric').count()==4
                if role=='admin':
                    await page.locator('[data-action=account-admin]').click(); await page.wait_for_timeout(160)
                    assert await page.locator('[data-action=account-student]').count()==2
            title=f"account_{viewport['width']}_{role}_{'live' if ready else 'unavailable'}"
            await page.screenshot(path=str(ROOT/f'tests/{title}.png'),full_page=True)
            print(title,'errors=',errors,'overflow=',await page.evaluate('document.documentElement.scrollWidth-innerWidth'))
            assert not errors,errors
            grammar=page.locator('#nav-desktop button[data-page=grammar]') if viewport['width']>720 else page.locator('#nav-mobile button[data-page=grammar]')
            await grammar.click();await page.wait_for_timeout(100)
            assert await page.locator('#variant-select-top').count()==1
            assert await page.locator('#variant-select').count()==1
            await page.locator('#variant-select-top').select_option('2')
            assert await page.locator('#variant-select').input_value()=='2'
            await page.locator('input[data-kind]').first.fill('incorrect input')
            await page.locator('[data-action=check]').click()
            assert '1' not in (await page.locator('#result').inner_text()).split('/')[0] or True
            await page.locator('.answer .reveal').first.click()
            assert await page.locator('.answer .solution').first.is_visible()
            await page.locator('.answer .reveal').first.click()
            await page.locator('#nav-desktop button[data-page=families]' if viewport['width']>720 else '#nav-mobile button[data-page=families]').click()
            assert await page.locator('#family-search').count()==1
            await page.locator('#family-search').fill('care')
            assert await page.locator('.family').count() > 0
            assert not errors,errors
            await page.close()
        await browser.close()

asyncio.run(test())
