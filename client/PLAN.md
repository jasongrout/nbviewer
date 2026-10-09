# nbviewer v2: client-side rendering

## Problem

nbviewer fetches every notebook server-side (GitHub REST API, raw URLs) and
renders it with nbconvert. Bot traffic multiplies both costs: each uncached
request spends nbviewer's shared GitHub API quota and a render slot.

## Goal

A notebook viewer that keeps the nbviewer URL structure, but where

- the notebook (and any GitHub API data) is fetched by the visitor's browser,
  so requests count against the visitor's own IP/rate limit, not nbviewer's;
- rendering happens in the browser, using JupyterLab's own components;
- the server only hands out one static HTML shell, identical for every URL,
  which a CDN can cache indefinitely.

It is served next to the existing viewer under a `/v2/` prefix, e.g.

    /v2/url/jakevdp.github.io/downloads/notebooks/XKCD_plots.ipynb
    /v2/github/ipython/ipython/blob/6.x/examples/IPython%20Kernel/Index.ipynb

## Static site or nbviewer server?

The URL structure does not require server logic: every `/v2/...` URL serves
the same HTML shell, and the client reads `location.pathname` to decide what
to fetch. Any host with a catch-all rewrite to `index.html` (nginx
`try_files`, Netlify/Cloudflare Pages SPA mode) can therefore serve it.
GitHub Pages can only do this through its `404.html` fallback, which answers
with HTTP 404.

To get started, the shell is served by nbviewer itself through one trivial
Tornado handler. It never touches the network, so its response can be cached
by Fastly for all paths. The client bundle has no dependency on the Python
server beyond a small JSON config blob in the shell (base URL, link to the
v1 viewer), so moving it to a static host later stays possible.

## Architecture

```
browser                                         nbviewer (Tornado)
-------                                         ------------------
GET /v2/url/host/path.ipynb  ------------------> V2Handler: static shell
                                                  (layout.html + bundle tag,
                                                   v2 CSP, no network I/O)
bundle parses location.pathname
  -> provider: url | urls | github | gist
fetch(https://host/path.ipynb)  ---> remote host (needs CORS)
fetch(raw.githubusercontent.com/...) ---> GitHub raw CDN (CORS: *)
fetch(api.github.com/...)  ---> GitHub REST API (CORS: *, 60 req/h/IP)
render with JupyterLab components into #notebook
```

### Components (all from JupyterLab 4, npm)

| Need | Package |
| --- | --- |
| Notebook model and widget | `@jupyterlab/notebook` (`NotebookModel`, `StaticNotebook`) |
| Cells, prompts, outputs | `@jupyterlab/cells`, `@jupyterlab/outputarea` (via the above) |
| MIME rendering (HTML, images, SVG, LaTeX, JS, markdown) | `@jupyterlab/rendermime` |
| Markdown parser | `@jupyterlab/markedparser-extension` (`marked`, same as Lab) |
| Math | `@jupyterlab/mathjax-extension` (MathJax 3, with its font CSS) |
| Code display / highlighting | `@jupyterlab/codemirror` (read-only CodeMirror 6) |
| Theme | `@jupyterlab/theme-light-extension` CSS variables |

Built with rspack (JupyterLab's bundler from 4.6 on) from `client/` into
`nbviewer/static/v2/`, which is already shipped as package data. The build is
added to the existing `setup.py` preflight next to the LESS build
(`invoke build-client`).

Dependency policy: `@jupyterlab/*` at the latest stable release (4.5.x); the
toolchain (rspack 1.7, TypeScript 5.9, css-loader 6, style-loader 3) at the
versions JupyterLab's own builder and packages use. `client/package-lock.json`
is committed so builds are reproducible (`npm ci`).

### Server side

- `nbviewer/v2.py`: `V2Handler` renders `templates/v2.html` (extends
  `layout.html`, so the navbar and footer match v1) for `/v2` and `/v2/.*`.
- It sends its own `Content-Security-Policy`. v1 sends `connect-src 'none'`,
  which would block the browser fetches. New trait
  `NBViewer.v2_content_security_policy`, default
  `connect-src 'self' https: http:;`.
- New trait `NBViewer.enable_v2` (default `True`) to switch it off.
- `Cache-Control: public` with a long max-age on the shell, since it doesn't
  vary by path.

### Trust and security

v1 already runs notebook-supplied HTML and JavaScript on the nbviewer origin
(nbconvert inlines `text/html` and `application/javascript` outputs). For
parity, v2 renders outputs as trusted and keeps jQuery and RequireJS on the
page (`layout.html` already loads them) because many classic-notebook outputs
(older Plotly and Bokeh output, for example) expect them as globals. For the
same reason, JavaScript outputs run with `element` bound to the jQuery-wrapped
output node, as in the classic Notebook and nbconvert's templates (JupyterLab
passes a bare DOM node). Markdown cells are sanitized, as in JupyterLab.

What differs from v1: `connect-src` must allow the hosts the browser fetches
from. The page holds no secrets (no tokens, no auth cookies outside
JupyterHub mode), so the exposure is equivalent to v1's.

Before any feature that puts a secret in the page (a user-supplied GitHub
token for higher rate limits, say), rendering must move into a sandboxed,
opaque-origin iframe (phase 4).

### Known limits of fetching in the browser

- `/url/` and `/urls/` only work for hosts that send CORS headers. GitHub
  Pages, raw.githubusercontent.com, gist.githubusercontent.com, GitLab raw,
  and Hugging Face send them; many personal servers don't. On failure the
  page explains why and links to the v1 rendering of the same URL.
- `/url/` (plain http) is upgraded to https when the page itself is on https,
  because browsers block mixed-content fetches.
- Crawlers that don't execute JavaScript see only the shell. The shell is
  marked `noindex` while v2 is experimental.
- Unauthenticated GitHub API: 60 requests/hour per visitor IP. Notebook
  views avoid the API entirely by reading raw.githubusercontent.com, which is
  CDN-backed and not counted against the REST quota. Only directory listings,
  user/repo listings and gists use the API.

## Phases

### Phase 1 (minimal): `/v2/url/` and `/v2/urls/` (done)

- Tornado `V2Handler` + `v2.html` shell + CSP trait + tests.
- Client: URL parsing for `url`/`urls` (including v1's encoding of query
  strings as a trailing `%3F...` segment), http-to-https upgrade, `fetch`
  with clear errors (CORS/network, HTTP status, invalid JSON, nbformat < 4),
  each linking to the v1 rendering.
- Render with `StaticNotebook`; trusted outputs; MathJax; syntax highlighting
  from `metadata.language_info` / kernelspec. All cells are laid out
  (`windowingMode: 'none'`), as in v1's static HTML, so positions are final.
- Normalize the notebook JSON as jupyter_server would before JupyterLab sees
  it (port of nbformat's `rejoin_lines`: multi-line strings stored as lists).
- `#heading` fragment links scroll to the heading once it has rendered
  (JupyterLab keeps header anchors in `data-jupyter-id`, not `id`).
- Navbar: Download notebook and View in classic nbviewer; page title from the
  file name.
- Relative links and images in markdown/HTML resolve against the notebook's
  source URL (rendermime `IResolver`); relative `.ipynb` links stay in v2.
- `/v2/` landing page: a form that maps a pasted URL to its `/v2/` path.
- Build integration (`client/`, webpack, `setup.py`, Docker).

### Phase 2: GitHub and Gist

- `/v2/github/{user}/{repo}/blob/{ref}/{path}`: fetch from
  `raw.githubusercontent.com` (no API calls). On 404, one Contents API call
  to tell a missing file from a directory (redirect to the tree view);
  non-notebook files redirect to their raw URL, so relative images keep
  working.
- Navbar: View on GitHub, Execute on Binder, breadcrumbs.
- Directory listings, `/v2/github/{user}/{repo}/tree/{ref}/{path}/`, with
  the same behavior as v1's `GitHubTreeHandler` and `treelist.html`:
  - One Contents API call (`GET /repos/{user}/{repo}/contents/{path}?ref={ref}`).
    v1 makes three per page, because it also lists branches and tags.
  - If the path is a file, redirect to the blob view. Paths without a
    trailing slash get one, as in v1.
  - Entries in v1's order: directories (link to their tree view), then
    notebooks (link to their v2 blob view), then other files (link to the
    file on GitHub). Submodules have no link.
  - Breadcrumbs from the repo root, plus a `..` row that leads to the parent
    directory, or to the user's repository list at the repo root. As in v1,
    user and repo are taken from the entries' `html_url`, so renamed repos
    give correct links.
  - Ref menu with branches and tags. It is fetched only when opened, so a
    listing costs one API call.
  - Navbar: View on GitHub (tree URL), Execute on Binder (repo at ref).
  - Rendered as plain links in v1's table markup and styles, not with
    JupyterLab's file browser. The file browser needs a contents drive and
    document manager, and navigates like an app rather than through
    linkable pages. Listing pages don't load the JupyterLab render chunk.
  - The Contents API lists at most 1,000 entries per directory (v1 has the
    same limit). Larger directories could fall back to the Git Trees API.
- `/v2/github/{user}/` (repo list), `/v2/github/{user}/{repo}/` (default
  branch lookup, then redirect).
- `/v2/gist/{user}/{id}[/{file}]` and `/v2/gist/{user}/`. Gists with
  several files get the same kind of listing, as in v1.
- Rate-limit errors are shown with the reset time from `X-RateLimit-Reset`.
- Same URL rewrites as v1 (`raw.githubusercontent.com` and `github.com`
  links under `/v2/url[s]/` redirect to `/v2/github/`).

### Phase 3: format and output parity

- nbformat 3 to 4 conversion in the browser (port of `nbformat.v4.convert`).
- ipywidgets from saved widget state (`@jupyter-widgets/html-manager`).
- Extra MIME renderers: Vega/Vega-Lite (`@jupyterlab/vega5-extension`),
  JSON, PDF, Mermaid in markdown.
- `/v2/format/script/...` (code export) and `/v2/format/slides/...` (reveal.js).
- `metadata._nbviewer.css` themes.
- Playwright end-to-end tests in CI (needs a workflow change).

### Phase 4: hardening and rollout

- Render inside a sandboxed iframe (opaque origin), communicating with the
  shell over `postMessage`. Prerequisite for optional user GitHub tokens.
- GitHub Enterprise via config (`GITHUB_API_URL` passed to the shell).
- Measure, then consider redirecting v1 URLs for bot-heavy paths to v2, or
  serving v2 by default with v1 as a fallback.
