import puppeteer from 'puppeteer';

(async () => {
  const browser = await puppeteer.launch();
  const page = await browser.newPage();
  
  page.on('console', msg => {
    if (msg.type() === 'error') {
      console.error('PAGE ERROR LOG:', msg.text());
    }
  });
  
  await page.goto('http://localhost:5173/login', { waitUntil: 'networkidle2' });
  
  await page.type('#login-username', 'admin');
  await page.type('#login-password', 'password123');
  await page.click('button[type="submit"]');
  
  await page.waitForNavigation({ waitUntil: 'networkidle2' });
  
  console.log('Navigating to /competitions...');
  await page.goto('http://localhost:5173/competitions', { waitUntil: 'networkidle2' });
  
  const text = await page.evaluate(() => document.body.innerText);
  console.log('BODY TEXT:', text);
  
  await browser.close();
})();
