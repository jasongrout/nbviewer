import { GitHubError } from './github.ts';
import { link, showError } from './page.ts';

/**
 * Settings the server puts in the page shell. A static host can leave them
 * out; the defaults then derive the viewer base from the current URL and
 * drop links to the server-rendered (v1) viewer.
 */
export interface IConfig {
  /** URL path of the viewer root, e.g. "/v2/". */
  viewerBase: string;
  /** URL path of the server-rendered viewer, e.g. "/", or null if none. */
  classicBase: string | null;
  /** Binder URL base, e.g. "https://mybinder.org/v2", or null for no link. */
  binderBaseUrl: string | null;
}

export function readConfig(): IConfig {
  const defaults: IConfig = {
    viewerBase: '/',
    classicBase: null,
    binderBaseUrl: 'https://mybinder.org/v2'
  };
  const el = document.getElementById('nbviewer-v2-config');
  if (el?.textContent) {
    return { ...defaults, ...JSON.parse(el.textContent) };
  }
  const i = window.location.pathname.indexOf('/v2/');
  if (i !== -1) {
    defaults.viewerBase = window.location.pathname.slice(0, i + 4);
  }
  return defaults;
}

/** What every view gets. */
export interface IContext {
  root: HTMLElement;
  config: IConfig;
  /** The current viewer path, relative to the viewer base, still encoded. */
  path: string;
  /** The same page in the server-rendered viewer, if there is one. */
  classicUrl: string | null;
}

/** The URL of a viewer path. */
export function viewerUrl(ctx: IContext, path: string): string {
  return ctx.config.viewerBase + path;
}

/** Replace the current page with another viewer path, like an HTTP redirect. */
export function redirect(ctx: IContext, path: string): void {
  window.location.replace(
    viewerUrl(ctx, path) + window.location.search + window.location.hash
  );
}

export function setTitle(title: string): void {
  document.title = `${title} - Jupyter Notebook Viewer`;
}

/**
 * Show an error, with links to where the content can be seen instead:
 * `elsewhere` (e.g. the GitHub page) and the classic viewer.
 */
export function showFailure(
  ctx: IContext,
  err: unknown,
  elsewhere: [string, string] | null,
  ...details: (Node | string)[][]
): void {
  const message = err instanceof Error ? err.message : String(err);
  if (err instanceof GitHubError && err.rateLimitReset) {
    details = [
      [`It resets at ${err.rateLimitReset.toLocaleTimeString()}.`],
      ...details
    ];
  }
  // "See the page on GitHub, or view it with the classic nbviewer."
  const alternatives: (Node | string)[] = [];
  if (elsewhere) {
    alternatives.push('See the ', link(elsewhere[0], elsewhere[1]));
  }
  if (ctx.classicUrl !== null) {
    alternatives.push(
      ...(alternatives.length
        ? [', or ', link(ctx.classicUrl, 'view it with the classic nbviewer')]
        : [link(ctx.classicUrl, 'View it with the classic nbviewer')])
    );
  }
  if (alternatives.length) {
    details = [...details, [...alternatives, '.']];
  }
  showError(ctx.root, message, ...details);
}
