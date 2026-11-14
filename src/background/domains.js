// Pure helpers about hostnames. No chrome.* here.

/** True when `host` is `domain` or one of its subdomains. */
export function hostIn(host, domain) {
  return host === domain || host.endsWith(`.${domain}`);
}

/**
 * What the owner typed or pasted, as a domain to store: a bare domain, or a
 * whole URL. `www.` goes, since a rule covers every subdomain anyway.
 * Returns null for anything that is not a web site.
 */
export function toDomain(input) {
  const text = String(input ?? "").trim().toLowerCase();
  if (!text) return null;
  let url;
  try {
    url = new URL(/^[a-z][a-z0-9+.-]*:\/\//.test(text) ? text : `https://${text}`);
  } catch {
    return null;
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") return null;
  const host = url.hostname.replace(/^www\./, "").replace(/\.$/, "");
  if (!/^[a-z0-9-]+(\.[a-z0-9-]+)+$/.test(host)) return null;
  return host;
}

/** A domain as a literal inside a regular expression. */
export function escapeDomain(domain) {
  return domain.replace(/[.\-]/g, "\\$&");
}

/**
 * A site's page regex, written for `location.pathname`, as the tail of a
 * regex over the whole URL: there a path is followed by `?` or `#`, so an
 * end anchor has to accept those too.
 */
export function pathRegexForUrl(regex) {
  let out = "";
  let inClass = false;
  const body = regex.replace(/^\^/, "");
  for (let i = 0; i < body.length; i++) {
    const char = body[i];
    if (char === "\\") {
      out += char + (body[i + 1] ?? "");
      i++;
    } else if (inClass) {
      if (char === "]") inClass = false;
      out += char;
    } else if (char === "[") {
      inClass = true;
      out += char;
    } else if (char === "$") {
      out += "(?:$|[?#])";
    } else {
      out += char;
    }
  }
  return out;
}
