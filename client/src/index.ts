import type * as nbformat from '@jupyterlab/nbformat';

import {
  addNavbarLink,
  link,
  scrollToFragment,
  showError,
  showHome,
  showStatus
} from './page';
import { rejoinLines } from './nbformat';
import { fetchUrl, parseRoute, viewerPathForInput } from './route';
import { RemoteResolver } from './resolver';

/**
 * Settings the server puts in the page shell. A static host can leave them
 * out; the defaults then derive the viewer base from the current URL and
 * drop links to the server-rendered (v1) viewer.
 */
interface IConfig {
  /** URL path of the viewer root, e.g. "/v2/". */
  viewerBase: string;
  /** URL path of the server-rendered viewer, e.g. "/", or null if none. */
  classicBase: string | null;
}

function readConfig(): IConfig {
  const el = document.getElementById('nbviewer-v2-config');
  if (el?.textContent) {
    return JSON.parse(el.textContent);
  }
  const i = window.location.pathname.indexOf('/v2/');
  return {
    viewerBase: i === -1 ? '/' : window.location.pathname.slice(0, i + 4),
    classicBase: null
  };
}

class NotebookError extends Error {
  constructor(
    message: string,
    readonly details: (Node | string)[][] = []
  ) {
    super(message);
  }
}

async function fetchNotebook(url: string): Promise<nbformat.INotebookContent> {
  let response: Response;
  try {
    response = await fetch(url, { credentials: 'omit' });
  } catch {
    throw new NotebookError(`Could not fetch ${url} from your browser.`, [
      [
        'The server may not allow cross-origin requests (CORS), or it may be ' +
          'unreachable. Your browser console may have more details.'
      ]
    ]);
  }
  if (!response.ok) {
    throw new NotebookError(
      `${response.status} ${response.statusText} fetching ${url}`
    );
  }
  let nb: any;
  try {
    nb = JSON.parse(await response.text());
  } catch {
    throw new NotebookError(`${url} is not a valid notebook (invalid JSON).`);
  }
  if (typeof nb !== 'object' || nb === null) {
    throw new NotebookError(`${url} is not a valid notebook.`);
  }
  if (typeof nb.nbformat === 'number' && nb.nbformat < 4) {
    throw new NotebookError(
      `This notebook uses nbformat ${nb.nbformat}, which v2 does not render yet.`
    );
  }
  if (!Array.isArray(nb.cells)) {
    throw new NotebookError(`${url} is not a valid notebook (no cells).`);
  }
  return rejoinLines(nb);
}

async function main(): Promise<void> {
  const root = document.getElementById('nbviewer-v2');
  if (!root) {
    return;
  }
  const config = readConfig();
  const path = window.location.pathname.slice(config.viewerBase.length);
  const route = parseRoute(path);
  const classicUrl =
    config.classicBase === null ? null : config.classicBase + path;

  if (route.kind === 'home') {
    showHome(root, input => {
      const p = viewerPathForInput(input);
      return p === null ? null : config.viewerBase + p;
    });
    return;
  }
  if (route.kind === 'notfound') {
    showError(root, '404: Not Found', [
      'v2 currently views URLs of the form ',
      link(
        config.viewerBase + 'url/example.org/notebook.ipynb',
        config.viewerBase + 'url/{host}/{path}'
      ),
      '.'
    ]);
    return;
  }

  const { remoteUrl, filename } = route;
  const url = fetchUrl(remoteUrl, window.location.protocol);

  // Like v1: a relative link from a notebook to a non-notebook file opens
  // the file itself rather than trying to render it.
  if (
    !/\.ipynb$/i.test(filename) &&
    document.referrer.startsWith(window.location.origin + config.viewerBase)
  ) {
    window.location.replace(url);
    return;
  }

  document.title = `${filename} - Jupyter Notebook Viewer`;
  showStatus(root, 'Loading notebook from ', link(url, url), '…');

  let nb: nbformat.INotebookContent;
  try {
    nb = await fetchNotebook(url);
  } catch (err) {
    const details = err instanceof NotebookError ? err.details : [];
    const alternatives: (Node | string)[] = [
      'Open the ',
      link(url, 'file directly')
    ];
    if (classicUrl !== null) {
      alternatives.push(
        ', or ',
        link(classicUrl, 'render it with the classic nbviewer')
      );
    }
    alternatives.push('.');
    showError(root, (err as Error).message, ...details, alternatives);
    return;
  }

  const kernel = nb.metadata?.kernelspec?.display_name;
  if (kernel) {
    addNavbarLink('#', `${kernel} Kernel`, 'server');
  }
  if (classicUrl !== null) {
    addNavbarLink(classicUrl, 'View in classic nbviewer', 'history');
  }
  addNavbarLink(url, 'Download Notebook', 'download');

  // Rendering code is a separate chunk, so the landing and error pages
  // stay light.
  const { renderNotebook } = await import(
    /* webpackChunkName: "render" */ './render'
  );
  root.replaceChildren();
  renderNotebook(nb, root, new RemoteResolver(url, config.viewerBase));
  scrollToFragment(root);
  window.addEventListener('hashchange', () => scrollToFragment(root));
}

void main();
