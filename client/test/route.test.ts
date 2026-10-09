import assert from 'node:assert/strict';
import { test } from 'node:test';

import {
  fetchUrl,
  parseRoute,
  viewerPath,
  viewerPathForInput
} from '../src/route.ts';

test('empty path is the landing page', () => {
  assert.deepEqual(parseRoute(''), { kind: 'home' });
});

test('unknown providers are not found', () => {
  assert.deepEqual(parseRoute('github/user/repo'), { kind: 'notfound' });
  assert.deepEqual(parseRoute('url/hostonly'), { kind: 'notfound' });
});

test('url and urls map to http and https', () => {
  assert.deepEqual(
    parseRoute('url/jakevdp.github.io/downloads/notebooks/XKCD_plots.ipynb'),
    {
      kind: 'url',
      remoteUrl:
        'http://jakevdp.github.io/downloads/notebooks/XKCD_plots.ipynb',
      filename: 'XKCD_plots.ipynb'
    }
  );
  assert.deepEqual(parseRoute('urls/example.org:8443/a/b.ipynb'), {
    kind: 'url',
    remoteUrl: 'https://example.org:8443/a/b.ipynb',
    filename: 'b.ipynb'
  });
});

test('percent-encoding in the path is kept', () => {
  const route = parseRoute('urls/example.org/My%20Notebooks/A%20B.ipynb');
  assert.equal(route.kind, 'url');
  if (route.kind === 'url') {
    assert.equal(
      route.remoteUrl,
      'https://example.org/My%20Notebooks/A%20B.ipynb'
    );
    assert.equal(route.filename, 'A B.ipynb');
  }
});

test('an encoded trailing ?query segment becomes the query string', () => {
  // as produced by v1's transform_ipynb_uri
  const route = parseRoute('urls/example.org/get/%3Fname%3Dnb.ipynb%26raw%3D1');
  assert.equal(route.kind, 'url');
  if (route.kind === 'url') {
    assert.equal(
      route.remoteUrl,
      'https://example.org/get?name=nb.ipynb&raw=1'
    );
  }
});

test('viewerPath round-trips through parseRoute', () => {
  for (const url of [
    'https://example.org/a/b.ipynb',
    'http://example.org:8080/My%20Notebook.ipynb',
    'https://example.org/get?name=nb.ipynb&x=a%20b'
  ]) {
    const path = viewerPath(url);
    assert.ok(path);
    const route = parseRoute(path);
    assert.equal(route.kind, 'url');
    if (route.kind === 'url') {
      assert.equal(route.remoteUrl, url);
    }
  }
  assert.equal(viewerPath('mailto:someone@example.org'), null);
  assert.equal(viewerPath('not a url'), null);
});

test('landing page input', () => {
  assert.equal(
    viewerPathForInput(' https://example.org/nb.ipynb '),
    'urls/example.org/nb.ipynb'
  );
  assert.equal(
    viewerPathForInput('example.org/nb.ipynb'),
    'urls/example.org/nb.ipynb'
  );
  assert.equal(
    viewerPathForInput('http://example.org/nb.ipynb'),
    'url/example.org/nb.ipynb'
  );
  assert.equal(viewerPathForInput(''), null);
});

test('http is upgraded only on https pages', () => {
  assert.equal(
    fetchUrl('http://example.org/nb.ipynb', 'https:'),
    'https://example.org/nb.ipynb'
  );
  assert.equal(
    fetchUrl('http://example.org/nb.ipynb', 'http:'),
    'http://example.org/nb.ipynb'
  );
  assert.equal(
    fetchUrl('https://example.org/nb.ipynb', 'http:'),
    'https://example.org/nb.ipynb'
  );
});
