import { RenderedJavaScript } from '@jupyterlab/rendermime';
import type { IRenderMime } from '@jupyterlab/rendermime-interfaces';

/**
 * Run JavaScript outputs of trusted cells the way the classic Notebook and
 * nbconvert's HTML templates (and so nbviewer v1) do: `element` is the
 * output's node wrapped with jQuery, which the page shell provides.
 * JupyterLab's javascript-extension passes a bare DOM node instead, which
 * breaks outputs that call jQuery methods on `element`.
 */
class ClassicRenderedJavaScript extends RenderedJavaScript {
  async render(model: IRenderMime.IMimeModel): Promise<void> {
    if (!model.trusted) {
      return super.render(model);
    }
    const code = model.data[this.mimeType];
    if (typeof code !== 'string' || !code) {
      return;
    }
    const jQuery = (window as any).jQuery;
    const element = jQuery ? jQuery(this.node) : this.node;
    new Function('element', code)(element);
  }
}

export const javaScriptRendererFactory: IRenderMime.IRendererFactory = {
  safe: false,
  mimeTypes: ['text/javascript', 'application/javascript'],
  createRenderer: options => new ClassicRenderedJavaScript(options)
};
