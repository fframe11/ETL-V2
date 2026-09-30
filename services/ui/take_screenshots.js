const puppeteer = require('puppeteer');
const path = require('path');

(async () => {
  console.log("Starting screenshot capturing...");
  const browser = await puppeteer.launch({
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox']
  });

  const page = await browser.newPage();
  await page.setViewport({ width: 1440, height: 900 });

  // Handle page errors
  page.on('console', msg => console.log('PAGE LOG:', msg.text()));
  page.on('pageerror', err => console.log('PAGE ERROR:', err.message));

  const artifactDir = "C:\\Users\\ffram\\.gemini\\antigravity\\brain\\7d7c7daa-29b6-4328-9bba-92a5aa3d7369";

  try {
    // 1. Visit Login page to initialize localStorage
    console.log("Navigating to login page to set session token...");
    await page.goto('http://localhost/login', { waitUntil: 'networkidle0', timeout: 30000 });
    
    // Bypassing login by setting localStorage token
    await page.evaluate(() => {
      localStorage.setItem("sdoqap_admin_token", "session_active_token_sdoqap");
    });
    console.log("Session token set successfully.");

    const pagesToScreenshot = [
      { name: 'dashboard', url: 'http://localhost/dashboard' },
      { name: 'schema', url: 'http://localhost/schema' },
      { name: 'rules', url: 'http://localhost/rules' },
      { name: 'analytics', url: 'http://localhost/analytics' }
    ];

    for (const p of pagesToScreenshot) {
      console.log(`Navigating to ${p.url}...`);
      await page.goto(p.url, { waitUntil: 'networkidle2', timeout: 30000 });
      
      // Wait for content to render properly (graphs, grids, etc.)
      console.log("Waiting 5 seconds for page components and charts to render...");
      await new Promise(r => setTimeout(r, 5000));
      
      const screenshotPath = path.join(artifactDir, `${p.name}.png`);
      console.log(`Taking screenshot for ${p.name} and saving to ${screenshotPath}...`);
      await page.screenshot({ path: screenshotPath, fullPage: false });
      console.log(`Screenshot saved successfully.`);
    }

  } catch (error) {
    console.error("An error occurred during execution:", error);
  } finally {
    await browser.close();
    console.log("Browser closed. Capturing finished.");
  }
})();
