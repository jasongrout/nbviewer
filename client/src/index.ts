import { type IContext, readConfig, redirect, viewerUrl } from './context.ts';
import { showGist, showGistUser } from './gist-views.ts';
import {
  showGithubBlob,
  showGithubRepo,
  showGithubTree,
  showGithubUser
} from './github-views.ts';
import { showNotebook } from './notebook-view.ts';
import { link, showError, showHome } from './page.ts';
import { viewerPathForInput } from './rewrites.ts';
import { fetchUrl, parseRoute, viewerPath } from './route.ts';

/** url/{netloc}/{path} and urls/{netloc}/{path} */
async function showUrl(
  ctx: IContext,
  remoteUrl: string,
  filename: string
): Promise<void> {
  const url = fetchUrl(remoteUrl, window.location.protocol);

  // Like v1: a relative link from a notebook to a non-notebook file opens
  // the file itself rather than trying to render it.
  if (
    !/\.ipynb$/i.test(filename) &&
    document.referrer.startsWith(window.location.origin + ctx.config.viewerBase)
  ) {
    window.location.replace(url);
    return;
  }

  await showNotebook(ctx, {
    url,
    title: filename,
    linkFor: absolute => {
      const path = /\.ipynb$/i.test(new URL(absolute).pathname)
        ? viewerPath(absolute)
        : null;
      return path === null ? absolute : viewerUrl(ctx, path);
    }
  });
}

async function main(): Promise<void> {
  const root = document.getElementById('nbviewer-v2');
  if (!root) {
    return;
  }
  const config = readConfig();
  const path = window.location.pathname.slice(config.viewerBase.length);
  const ctx: IContext = {
    root,
    config,
    path,
    classicUrl: config.classicBase === null ? null : config.classicBase + path
  };

  const route = parseRoute(path);
  switch (route.kind) {
    case 'home':
      showHome(root, input => {
        const p = viewerPathForInput(input);
        return p === null ? null : viewerUrl(ctx, p);
      });
      return;
    case 'redirect':
      redirect(ctx, route.path);
      return;
    case 'url':
      return showUrl(ctx, route.remoteUrl, route.filename);
    case 'github-user':
      return showGithubUser(ctx, route.user);
    case 'github-repo':
      return showGithubRepo(ctx, route.user, route.repo);
    case 'github-tree':
      return showGithubTree(ctx, route);
    case 'github-blob':
      return showGithubBlob(ctx, route);
    case 'gist':
      return showGist(ctx, route.user, route.id, route.filename);
    case 'gist-user':
      return showGistUser(ctx, route.user);
    case 'notfound':
      showError(root, '404: Not Found', [
        'See the ',
        link(viewerUrl(ctx, ''), 'start page'),
        ' for the kinds of URLs v2 can show.'
      ]);
      return;
  }
}

void main();
