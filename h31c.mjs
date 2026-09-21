import puppeteer from 'puppeteer-core';
const browser = await puppeteer.launch({ executablePath: '/usr/bin/google-chrome', headless: 'new', args: ['--no-sandbox', '--disable-dev-shm-usage', '--font-render-hinting=none'] });
const sleep = ms => new Promise(r => setTimeout(r, ms));
const p = await browser.newPage();
await p.setViewport({ width: 390, height: 844, deviceScaleFactor: 2 });
await p.evaluateOnNewDocument(() => {
  localStorage.clear();
  localStorage.setItem('auth_user', JSON.stringify({ uid: 'u13', email: 'yuval@example.com', name: 'Yuval' }));
  localStorage.setItem('google_access_token', 'mock-token');
  localStorage.setItem('app_language', 'he');
});
await p.goto('http://localhost:4174/', { waitUntil: 'networkidle0', timeout: 45000 });
await p.evaluate(() => (window).__harnessAuth.signIn({ email: 'yuval@example.com', displayName: 'Yuval' }));
await sleep(3200);
await p.evaluate(() => { [...document.querySelectorAll('button')].find(b => b.getBoundingClientRect().width > 0)?.click(); });
await sleep(2400);
await p.evaluate(() => { document.querySelector('[role="dialog"] button')?.click(); });
await sleep(3400);
await p.screenshot({ path: '/downloads/visual-check/h31-empty-he-mobile.png' });
await p.evaluate(() => {
  const hero = document.querySelector('.max-w-3xl');
  const btns = [...document.querySelectorAll('.max-w-3xl button.group')];
  btns[1]?.click();
});
await sleep(1500);
await p.screenshot({ path: '/downloads/visual-check/h31-fold-he-mobile.png' });
await browser.close();
console.log('done');
