/**
 * Map /v2/ viewer paths to remote notebook URLs and back.
 *
 * Mirrors the v1 url provider (nbviewer/providers/url/handlers.py):
 *
 *   /url/{netloc}/{path}   -> http://{netloc}/{path}
 *   /urls/{netloc}/{path}  -> https://{netloc}/{path}
 *
 * A query string on the remote URL is carried as a final, percent-encoded
 * path segment starting with "?" (see transform_ipynb_uri in utils.py).
 */

export type Route =
  | { kind: 'home' }
  | {
      kind: 'url';
      /** The remote URL as written in the nbviewer path. */
      remoteUrl: string;
      /** The last path segment, for page titles and download names. */
      filename: string;
    }
  | { kind: 'notfound' };

const ENCODED_QUERY = /\/%3F/i;

/**
 * Parse a path relative to the /v2/ prefix (no leading slash),
 * still percent-encoded as in location.pathname.
 */
export function parseRoute(path: string): Route {
  if (path === '') {
    return { kind: 'home' };
  }
  const match = /^url(s?)\/([^/]+)\/(.*)$/.exec(path);
  if (!match) {
    return { kind: 'notfound' };
  }
  const [, secure, netloc, rest] = match;
  let urlPath = rest;
  let query = '';
  const q = urlPath.search(ENCODED_QUERY);
  if (q !== -1) {
    query = '?' + decodeURIComponent(urlPath.slice(q + 4));
    urlPath = urlPath.slice(0, q);
  }
  const remoteUrl = `http${secure}://${decodeURIComponent(netloc)}/${urlPath}${query}`;
  const filename = decodeURIComponent(urlPath.split('/').pop() || '');
  return { kind: 'url', remoteUrl, filename };
}

/**
 * The viewer path (relative to the /v2/ prefix) for a remote URL,
 * or null if it can't be viewed through the url provider.
 */
export function viewerPath(remoteUrl: string): string | null {
  let url: URL;
  try {
    url = new URL(remoteUrl);
  } catch {
    return null;
  }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    return null;
  }
  const prefix = url.protocol === 'https:' ? 'urls' : 'url';
  let path = `${prefix}/${url.host}${url.pathname}`;
  if (url.search) {
    path += '/' + encodeURIComponent(url.search);
  }
  return path;
}

/**
 * Turn whatever a user pastes into the landing page form into a viewer path:
 * a full URL, or a bare host/path (assumed https).
 */
export function viewerPathForInput(input: string): string | null {
  const value = input.trim();
  if (!value) {
    return null;
  }
  if (/^https?:\/\//i.test(value)) {
    return viewerPath(value);
  }
  return viewerPath('https://' + value);
}

/**
 * The URL to fetch from the browser. A page served over https can't fetch
 * plain http (mixed content), so upgrade it.
 */
export function fetchUrl(remoteUrl: string, pageProtocol: string): string {
  if (pageProtocol === 'https:' && remoteUrl.startsWith('http://')) {
    return 'https://' + remoteUrl.slice('http://'.length);
  }
  return remoteUrl;
}
