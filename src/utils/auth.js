'use strict';

/**
 * Parse a cookie string "name=value; name2=value2" into an array of
 * Puppeteer-compatible cookie objects for a given URL.
 */
function parseCookies(cookieStr, url) {
  if (!cookieStr) return [];
  let domain = '';
  try { domain = new URL(url).hostname; } catch (e) {}
  return cookieStr.split(';').map(part => {
    const [name, ...rest] = part.trim().split('=');
    return { name: name.trim(), value: rest.join('=').trim(), domain };
  }).filter(c => c.name);
}

/**
 * Parse "--auth-header" value into { name, value } e.g. "Authorization: Bearer abc"
 */
function parseAuthHeader(authHeader) {
  if (!authHeader) return null;
  const idx = authHeader.indexOf(':');
  if (idx === -1) return null;
  return { name: authHeader.slice(0, idx).trim(), value: authHeader.slice(idx + 1).trim() };
}

/**
 * Use Puppeteer to perform a form-based login and return the resulting cookies.
 * Tries common selectors for username/password fields.
 */
async function loginWithPuppeteer(browser, loginUrl, username, password, companyId) {
  const page = await browser.newPage();
  try {
    await page.goto(loginUrl, { waitUntil: 'networkidle2', timeout: 30000 });

    // Fill company ID field if provided
    if (companyId) {
      const companyField = await page.$('#CompanyId, input[name="CompanyId"]');
      if (!companyField) throw new Error('Could not find CompanyId input on login page');
      await companyField.click({ clickCount: 3 });
      await companyField.type(String(companyId), { delay: 30 });
    }

    const usernameSelectors = [
      'input[type="email"]',
      'input[name="username"]', 'input[name="user"]', 'input[name="email"]',
      'input[id*="user"]', 'input[id*="email"]', 'input[id*="login"]',
      'input[type="text"]'
    ];
    let usernameField = null;
    for (const sel of usernameSelectors) {
      usernameField = await page.$(sel);
      if (usernameField) break;
    }
    if (!usernameField) throw new Error('Could not find username/email input on login page');

    const passwordField = await page.$('input[type="password"]');
    if (!passwordField) throw new Error('Could not find password input on login page');

    await usernameField.click({ clickCount: 3 });
    await usernameField.type(username, { delay: 30 });
    await passwordField.click({ clickCount: 3 });
    await passwordField.type(password, { delay: 30 });

    const submitButton = await page.$('button[type="submit"], input[type="submit"]');
    if (submitButton) {
      await Promise.all([
        page.waitForNavigation({ waitUntil: 'networkidle2', timeout: 15000 }),
        submitButton.click()
      ]);
    } else {
      await Promise.all([
        page.waitForNavigation({ waitUntil: 'networkidle2', timeout: 15000 }),
        passwordField.press('Enter')
      ]);
    }

    return await page.cookies();
  } finally {
    await page.close();
  }
}

/**
 * Convert an array of Puppeteer cookie objects to a "Cookie: ..." header string.
 */
function cookiesToHeader(cookies) {
  return cookies.map(c => `${c.name}=${c.value}`).join('; ');
}

module.exports = { parseCookies, parseAuthHeader, loginWithPuppeteer, cookiesToHeader };
