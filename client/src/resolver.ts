import type { IRenderMime } from '@jupyterlab/rendermime-interfaces';

import { viewerPath } from './route';

/**
 * Resolve relative links and images in rendered markdown and HTML against
 * the notebook's remote URL, so they point at the source host instead of
 * at nbviewer. Links to other notebooks stay inside the viewer.
 */
export class RemoteResolver implements IRenderMime.IResolver {
  constructor(
    private readonly notebookUrl: string,
    private readonly viewerBase: string
  ) {}

  isLocal(url: string): boolean {
    if (url.startsWith('//')) {
      return false;
    }
    try {
      new URL(url);
      return false;
    } catch {
      // No scheme: relative to the notebook.
      return true;
    }
  }

  async resolveUrl(url: string): Promise<string> {
    return new URL(url, this.notebookUrl).href;
  }

  async getDownloadUrl(url: string): Promise<string> {
    if (/\.ipynb$/i.test(new URL(url).pathname)) {
      const path = viewerPath(url);
      if (path !== null) {
        return this.viewerBase + path;
      }
    }
    return url;
  }
}
