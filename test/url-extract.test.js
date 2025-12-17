process.env.NO_AUTO_START = '1';
process.env.NODE_ENV = 'test';

import { test, describe } from 'node:test';
import assert from 'node:assert';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { extractUrls, extractRootDomain, analyzeSender } from '../src/url_extract.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const loadFixture = (filename) => fs.readFileSync(path.join(__dirname, 'fixtures', filename), 'utf8');

describe('extractRootDomain', () => {
  test('extracts root domain from simple URL', () => {
    assert.strictEqual(extractRootDomain('https://www.google.com/search'), 'google.com');
  });

  test('extracts root domain from subdomain URL', () => {
    assert.strictEqual(extractRootDomain('https://mail.google.com/inbox'), 'google.com');
  });

  test('handles multi-part TLDs like co.uk', () => {
    assert.strictEqual(extractRootDomain('https://www.example.co.uk/page'), 'example.co.uk');
  });

  test('handles multi-part TLDs like com.au', () => {
    assert.strictEqual(extractRootDomain('https://shop.example.com.au'), 'example.com.au');
  });

  test('returns null for invalid URL', () => {
    assert.strictEqual(extractRootDomain('not-a-url'), null);
  });

  test('handles URL without subdomain', () => {
    assert.strictEqual(extractRootDomain('https://example.com'), 'example.com');
  });

  test('handles deep subdomains', () => {
    assert.strictEqual(extractRootDomain('https://a.b.c.d.example.com/path'), 'example.com');
  });
});

describe('extractUrls', () => {
  test('returns empty result for null input', () => {
    const result = extractUrls(null);
    assert.deepStrictEqual(result.urls, []);
    assert.strictEqual(result.has_mismatched_urls, false);
    assert.strictEqual(result.has_suspicious_domains, false);
  });

  test('extracts plaintext URLs', () => {
    const body = 'Check out https://example.com/page for more info.';
    const result = extractUrls(body);
    assert.strictEqual(result.urls.length, 1);
    assert.strictEqual(result.urls[0].url, 'https://example.com/page');
    assert.strictEqual(result.urls[0].root_domain, 'example.com');
    assert.strictEqual(result.urls[0].source, 'plaintext');
  });

  test('extracts HTML anchor with matching display/href', () => {
    const body = '<a href="https://paypal.com/login">https://paypal.com/login</a>';
    const result = extractUrls(body);
    assert.strictEqual(result.urls.length, 1);
    assert.strictEqual(result.urls[0].root_domain, 'paypal.com');
    assert.strictEqual(result.urls[0].mismatch, false);
  });

  test('detects mismatched display text vs href', () => {
    const body = '<a href="https://paypal.scammer.ru/steal">https://paypal.com/secure</a>';
    const result = extractUrls(body);
    assert.strictEqual(result.urls.length, 1);
    assert.strictEqual(result.urls[0].url, 'https://paypal.scammer.ru/steal');
    assert.strictEqual(result.urls[0].root_domain, 'scammer.ru');
    assert.strictEqual(result.urls[0].display_domain, 'paypal.com');
    assert.strictEqual(result.urls[0].mismatch, true);
    assert.strictEqual(result.has_mismatched_urls, true);
  });

  test('detects suspicious domains impersonating brands', () => {
    const body = 'Visit https://google-security-alert.com/verify to secure your account.';
    const result = extractUrls(body);
    assert.strictEqual(result.urls.length, 1);
    assert.strictEqual(result.urls[0].suspicious, true);
    assert.ok(result.urls[0].suspicious_reason.includes('google'));
    assert.strictEqual(result.has_suspicious_domains, true);
  });

  test('does not flag legitimate domains as suspicious', () => {
    const body = 'Log in at https://www.google.com/accounts';
    const result = extractUrls(body);
    assert.strictEqual(result.urls.length, 1);
    assert.strictEqual(result.urls[0].suspicious, false);
    assert.strictEqual(result.has_suspicious_domains, false);
  });

  test('generates warning summary for mismatched URLs', () => {
    const body = '<a href="https://apple.id-verify.scamsite.ru/account">https://apple.com/verify</a>';
    const result = extractUrls(body);
    assert.ok(result.summary);
    assert.ok(result.summary.includes('MISMATCH'));
  });

  test('handles multiple URLs with mixed results', () => {
    const body = `
      <a href="https://google.com/search">Google Search</a>
      <a href="https://paypal.evil.net/steal">https://paypal.com/secure</a>
      Visit https://example.com for more.
    `;
    const result = extractUrls(body);
    assert.ok(result.urls.length >= 2);
    assert.strictEqual(result.has_mismatched_urls, true);
  });

  test('deduplicates URLs preferring HTML anchor over plaintext', () => {
    const body = `
      <a href="https://example.com/page">Click here</a>
      Also see https://example.com/page for details.
    `;
    const result = extractUrls(body);
    // Should dedupe to just one entry, preferring the HTML anchor
    const exampleUrls = result.urls.filter(u => u.url === 'https://example.com/page');
    assert.strictEqual(exampleUrls.length, 1);
    assert.strictEqual(exampleUrls[0].source, 'html_anchor');
  });

  test('handles anchor tags with non-URL display text', () => {
    const body = '<a href="https://legitimate-bank.com/login">Click here to login</a>';
    const result = extractUrls(body);
    assert.strictEqual(result.urls.length, 1);
    assert.strictEqual(result.urls[0].display_text, 'Click here to login');
    assert.strictEqual(result.urls[0].mismatch, false); // display text doesn't look like a URL
  });
});

describe('analyzeSender', () => {
  test('parses standard email format', () => {
    const result = analyzeSender('John Doe <john@example.com>');
    assert.strictEqual(result.email, 'john@example.com');
    assert.strictEqual(result.display_name, 'John Doe');
    assert.strictEqual(result.domain, 'example.com');
    assert.strictEqual(result.root_domain, 'example.com');
  });

  test('parses email with quoted display name', () => {
    const result = analyzeSender('"Support Team" <support@company.com>');
    assert.strictEqual(result.email, 'support@company.com');
    assert.strictEqual(result.display_name, 'Support Team');
  });

  test('parses bare email address', () => {
    const result = analyzeSender('user@domain.com');
    assert.strictEqual(result.email, 'user@domain.com');
    assert.strictEqual(result.domain, 'domain.com');
  });

  test('handles null input', () => {
    const result = analyzeSender(null);
    assert.strictEqual(result.email, null);
  });

  test('extracts root domain from sender with subdomain', () => {
    const result = analyzeSender('Alerts <alerts@mail.bankco.com>');
    assert.strictEqual(result.domain, 'mail.bankco.com');
    assert.strictEqual(result.root_domain, 'bankco.com');
  });
});

// ============================================================================
// FIXTURE-BASED TESTS - Test against actual email fixtures
// ============================================================================

describe('URL extraction from phishing email fixture', () => {
  const phishingEmail = loadFixture('raw/phishing_fake_urgent.eml');

  test('extracts URLs from phishing email', () => {
    const result = extractUrls(phishingEmail);
    assert.ok(result.urls.length >= 2, 'Should find at least 2 URLs in phishing email');
  });

  test('detects mismatched URLs in phishing email', () => {
    const result = extractUrls(phishingEmail);
    assert.strictEqual(result.has_mismatched_urls, true, 'Should detect mismatched URLs');
    
    // Find the specific mismatch: display shows apple.com but links to scamsite.ru
    const mismatchedUrl = result.urls.find(u => u.mismatch);
    assert.ok(mismatchedUrl, 'Should have at least one mismatched URL');
    assert.strictEqual(mismatchedUrl.root_domain, 'scamsite.ru', 'Actual domain should be scamsite.ru');
    assert.strictEqual(mismatchedUrl.display_domain, 'apple.com', 'Display domain should be apple.com');
  });

  test('detects suspicious domains in phishing email', () => {
    const result = extractUrls(phishingEmail);
    assert.strictEqual(result.has_suspicious_domains, true, 'Should detect suspicious domains');
    
    // Should flag icloud-support.fraudsters.net as suspicious (contains "icloud")
    const suspiciousUrl = result.urls.find(u => u.suspicious);
    assert.ok(suspiciousUrl, 'Should have at least one suspicious URL');
  });

  test('generates warning summary for phishing email', () => {
    const result = extractUrls(phishingEmail);
    assert.ok(result.summary, 'Should generate a warning summary');
    assert.ok(
      result.summary.includes('MISMATCH') || result.summary.includes('SUSPICIOUS'),
      'Summary should mention mismatch or suspicious'
    );
  });

  test('analyzes phishing sender correctly', () => {
    // Extract From header from the email
    const fromMatch = phishingEmail.match(/^From:\s*(.+)$/m);
    assert.ok(fromMatch, 'Should find From header');
    
    const result = analyzeSender(fromMatch[1]);
    assert.strictEqual(result.root_domain, 'scamsite.ru', 'Sender root domain should be scamsite.ru');
    assert.ok(
      result.email.includes('scamsite.ru'),
      'Sender email should be from scamsite.ru'
    );
  });
});

describe('URL extraction from legitimate bank email fixture', () => {
  const legitEmail = loadFixture('raw/legit_urgent_bank.eml');

  test('extracts URLs from legitimate email', () => {
    const result = extractUrls(legitEmail);
    assert.ok(result.urls.length >= 1, 'Should find at least 1 URL in legitimate email');
  });

  test('does NOT flag mismatched URLs in legitimate email', () => {
    const result = extractUrls(legitEmail);
    assert.strictEqual(result.has_mismatched_urls, false, 'Should NOT detect mismatched URLs in legit email');
  });

  test('does NOT flag suspicious domains in legitimate email', () => {
    const result = extractUrls(legitEmail);
    assert.strictEqual(result.has_suspicious_domains, false, 'Should NOT flag wellsfargo.com as suspicious');
  });

  test('all URLs point to wellsfargo.com', () => {
    const result = extractUrls(legitEmail);
    const wfUrls = result.urls.filter(u => u.root_domain === 'wellsfargo.com');
    assert.strictEqual(
      wfUrls.length,
      result.urls.length,
      'All URLs should point to wellsfargo.com'
    );
  });

  test('does NOT generate warning summary for legitimate email', () => {
    const result = extractUrls(legitEmail);
    assert.strictEqual(result.summary, null, 'Should NOT generate warning summary for legit email');
  });

  test('analyzes legitimate sender correctly', () => {
    // Extract From header from the email
    const fromMatch = legitEmail.match(/^From:\s*(.+)$/m);
    assert.ok(fromMatch, 'Should find From header');
    
    const result = analyzeSender(fromMatch[1]);
    assert.strictEqual(result.root_domain, 'wellsfargo.com', 'Sender root domain should be wellsfargo.com');
  });
});

