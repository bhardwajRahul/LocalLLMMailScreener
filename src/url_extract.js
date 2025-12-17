/**
 * URL extraction and analysis for phishing detection.
 * Extracts URLs from email bodies, parses root domains,
 * and flags suspicious patterns like display/href mismatches.
 */

/**
 * Extract the root domain from a URL (e.g., "mail.google.com" -> "google.com")
 * Handles subdomains and common TLDs.
 */
export const extractRootDomain = (url) => {
  try {
    const parsed = new URL(url);
    const hostname = parsed.hostname.toLowerCase();
    
    // Common multi-part TLDs
    const multiPartTlds = [
      'co.uk', 'co.nz', 'co.jp', 'co.kr', 'co.in', 'co.za',
      'com.au', 'com.br', 'com.mx', 'com.sg', 'com.hk',
      'org.uk', 'org.au', 'net.au', 'gov.uk', 'ac.uk'
    ];
    
    const parts = hostname.split('.');
    if (parts.length <= 2) return hostname;
    
    // Check for multi-part TLD
    const lastTwo = parts.slice(-2).join('.');
    if (multiPartTlds.includes(lastTwo)) {
      return parts.slice(-3).join('.');
    }
    
    return parts.slice(-2).join('.');
  } catch {
    return null;
  }
};

/**
 * Extract URLs from plain text (finds http/https URLs)
 * Skips URLs that appear inside HTML anchor tags (those are handled separately)
 */
const extractPlaintextUrls = (text) => {
  if (!text) return [];
  
  // First, remove all anchor tags to avoid double-counting
  const textWithoutAnchors = text.replace(/<a\s+[^>]*href\s*=\s*["'][^"']+["'][^>]*>[\s\S]*?<\/a>/gi, ' ');
  
  // Match URLs starting with http:// or https://
  const urlRegex = /https?:\/\/[^\s<>"')\]]+/gi;
  const matches = textWithoutAnchors.match(urlRegex) || [];
  
  return matches.map((url) => {
    // Clean trailing punctuation that's likely not part of URL
    const cleaned = url.replace(/[.,;:!?)>\]]+$/, '');
    return {
      display_text: cleaned,
      url: cleaned,
      root_domain: extractRootDomain(cleaned),
      source: 'plaintext'
    };
  });
};

/**
 * Extract URLs from HTML anchor tags, capturing display text and href separately
 */
const extractHtmlLinks = (text) => {
  if (!text) return [];
  
  const results = [];
  
  // Match <a> tags with href attribute
  // Handles: <a href="...">text</a>, <a href='...'>, etc.
  const anchorRegex = /<a\s+[^>]*href\s*=\s*["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi;
  
  let match;
  while ((match = anchorRegex.exec(text)) !== null) {
    const href = match[1];
    // Strip HTML tags from display text and normalize whitespace
    const displayText = match[2]
      .replace(/<[^>]+>/g, '')
      .replace(/\s+/g, ' ')
      .trim();
    
    // Only process http/https URLs
    if (href.startsWith('http://') || href.startsWith('https://')) {
      const hrefDomain = extractRootDomain(href);
      
      // Check if display text looks like a URL/domain
      const displayLooksLikeUrl = /^(https?:\/\/)?[\w.-]+\.(com|org|net|edu|gov|io|co|us|uk|ca|au|de|fr|jp|cn|ru|br|in|mx|es|it|nl|se|no|fi|dk|pl|cz|at|ch|be|pt|ie|nz|sg|hk|kr|tw|my|ph|th|vn|id|za)/.test(displayText);
      
      let displayDomain = null;
      let mismatch = false;
      
      if (displayLooksLikeUrl) {
        // Extract domain from display text
        const displayUrl = displayText.startsWith('http') 
          ? displayText 
          : `https://${displayText}`;
        displayDomain = extractRootDomain(displayUrl);
        
        // Flag mismatch if display domain differs from actual href domain
        if (displayDomain && hrefDomain && displayDomain !== hrefDomain) {
          mismatch = true;
        }
      }
      
      results.push({
        display_text: displayText || '[no text]',
        url: href,
        root_domain: hrefDomain,
        display_domain: displayDomain,
        mismatch,
        source: 'html_anchor'
      });
    }
  }
  
  return results;
};

/**
 * Deduplicate URLs by href, keeping the most informative entry
 */
const deduplicateUrls = (urls) => {
  const seen = new Map();
  
  for (const entry of urls) {
    const key = entry.url.toLowerCase();
    const existing = seen.get(key);
    
    if (!existing) {
      seen.set(key, entry);
    } else {
      // Prefer HTML anchor (has display text) over plaintext
      if (entry.source === 'html_anchor' && existing.source === 'plaintext') {
        seen.set(key, entry);
      }
      // Prefer entries with mismatch flag set
      if (entry.mismatch && !existing.mismatch) {
        seen.set(key, entry);
      }
    }
  }
  
  return Array.from(seen.values());
};

/**
 * Check if a domain looks suspicious (common phishing patterns)
 * @param {string} rootDomain - The root domain (e.g., "scammer.ru")
 * @param {string} fullHostname - Optional full hostname for subdomain checks (e.g., "icloud-support.scammer.ru")
 */
const checkSuspiciousDomain = (rootDomain, fullHostname = null) => {
  if (!rootDomain) return { suspicious: false };
  
  const dominated = rootDomain.toLowerCase();
  const fullHost = (fullHostname || rootDomain).toLowerCase();
  
  // Known legitimate domains that scammers impersonate
  const impersonatedBrands = [
    'google', 'gmail', 'microsoft', 'outlook', 'office365', 'apple', 'icloud',
    'amazon', 'aws', 'paypal', 'netflix', 'spotify', 'dropbox', 'facebook',
    'instagram', 'twitter', 'linkedin', 'bank', 'wellsfargo', 'chase', 'citi',
    'usps', 'fedex', 'ups', 'dhl', 'irs', 'gov', 'security', 'verify', 'account',
    'support', 'help', 'service', 'update', 'confirm', 'alert', 'notification'
  ];
  
  // Legitimate root domains for these brands
  const legitimateDomains = [
    'google.com', 'gmail.com', 'microsoft.com', 'outlook.com', 'office365.com',
    'apple.com', 'icloud.com', 'amazon.com', 'aws.amazon.com', 'paypal.com',
    'netflix.com', 'spotify.com', 'dropbox.com', 'facebook.com', 'instagram.com',
    'twitter.com', 'x.com', 'linkedin.com', 'wellsfargo.com', 'chase.com',
    'citi.com', 'usps.com', 'fedex.com', 'ups.com', 'dhl.com'
  ];
  
  // If this IS a known legitimate domain, not suspicious
  if (legitimateDomains.includes(dominated)) {
    return { suspicious: false };
  }
  
  // Check if root domain contains brand names but isn't legitimate
  // e.g., "google-security.com" or "paypal-verify.net"
  for (const brand of impersonatedBrands) {
    if (dominated.includes(brand) && !legitimateDomains.includes(dominated)) {
      return {
        suspicious: true,
        reason: `Domain contains "${brand}" but is not the legitimate ${brand} domain`
      };
    }
  }
  
  // Also check full hostname (subdomains) for brand impersonation
  // e.g., "icloud-support.fraudsters.net" - fraudsters.net is the root but "icloud" is in subdomain
  if (fullHost !== dominated) {
    for (const brand of impersonatedBrands) {
      if (fullHost.includes(brand)) {
        return {
          suspicious: true,
          reason: `Hostname "${fullHost}" contains "${brand}" but root domain is ${rootDomain}`
        };
      }
    }
  }
  
  return { suspicious: false };
};

/**
 * Main extraction function: extract and analyze all URLs from email text
 * @param {string} bodyText - The email body (can be plain text or contain HTML)
 * @returns {Object} URL analysis results
 */
export const extractUrls = (bodyText) => {
  if (!bodyText) {
    return {
      urls: [],
      has_mismatched_urls: false,
      has_suspicious_domains: false,
      summary: null
    };
  }
  
  // Extract from both HTML and plaintext patterns
  const htmlLinks = extractHtmlLinks(bodyText);
  const plaintextUrls = extractPlaintextUrls(bodyText);
  
  // Combine and deduplicate
  const allUrls = deduplicateUrls([...htmlLinks, ...plaintextUrls]);
  
  // Analyze each URL for suspicious patterns
  const analyzedUrls = allUrls.map((entry) => {
    // Extract full hostname for subdomain checking
    let fullHostname = null;
    try {
      fullHostname = new URL(entry.url).hostname;
    } catch { /* ignore */ }
    
    const suspiciousCheck = checkSuspiciousDomain(entry.root_domain, fullHostname);
    return {
      ...entry,
      suspicious: suspiciousCheck.suspicious,
      suspicious_reason: suspiciousCheck.reason || null
    };
  });
  
  // Compute summary flags
  const hasMismatchedUrls = analyzedUrls.some((u) => u.mismatch);
  const hasSuspiciousDomains = analyzedUrls.some((u) => u.suspicious);
  
  // Build human-readable summary for the LLM
  let summary = null;
  if (hasMismatchedUrls || hasSuspiciousDomains) {
    const issues = [];
    
    const mismatched = analyzedUrls.filter((u) => u.mismatch);
    if (mismatched.length > 0) {
      const examples = mismatched
        .slice(0, 3)
        .map((u) => `"${u.display_text}" actually links to ${u.root_domain}`)
        .join('; ');
      issues.push(`URL MISMATCH DETECTED: ${examples}`);
    }
    
    const suspicious = analyzedUrls.filter((u) => u.suspicious);
    if (suspicious.length > 0) {
      const examples = suspicious
        .slice(0, 3)
        .map((u) => `${u.root_domain} (${u.suspicious_reason})`)
        .join('; ');
      issues.push(`SUSPICIOUS DOMAINS: ${examples}`);
    }
    
    summary = issues.join(' | ');
  }
  
  return {
    urls: analyzedUrls,
    has_mismatched_urls: hasMismatchedUrls,
    has_suspicious_domains: hasSuspiciousDomains,
    summary
  };
};

/**
 * Analyze sender address for domain mismatches
 * @param {string} fromHeader - The From header value
 * @returns {Object} Sender analysis
 */
export const analyzeSender = (fromHeader) => {
  if (!fromHeader) {
    return { email: null, display_name: null, domain: null, root_domain: null };
  }
  
  // Try "Display Name <email@domain.com>" format first
  const bracketMatch = fromHeader.match(/^(?:"?([^"<]*)"?\s*)?<([^<>]+@[^<>]+)>$/);
  if (bracketMatch) {
    const displayName = (bracketMatch[1] || '').trim();
    const email = bracketMatch[2];
    const domain = email.split('@')[1]?.toLowerCase() || null;
    const rootDomain = domain ? extractRootDomain(`https://${domain}`) : null;
    return {
      email,
      display_name: displayName || null,
      domain,
      root_domain: rootDomain
    };
  }
  
  // Try bare email address format
  const bareMatch = fromHeader.match(/^([^\s@]+@[^\s@]+\.[^\s@]+)$/);
  if (bareMatch) {
    const email = bareMatch[1];
    const domain = email.split('@')[1]?.toLowerCase() || null;
    const rootDomain = domain ? extractRootDomain(`https://${domain}`) : null;
    return {
      email,
      display_name: null,
      domain,
      root_domain: rootDomain
    };
  }
  
  return { email: null, display_name: fromHeader, domain: null, root_domain: null };
};

export default { extractUrls, extractRootDomain, analyzeSender };

