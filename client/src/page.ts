/**
 * Page chrome around the rendered notebook. Remote strings are only ever
 * inserted as text, never as HTML.
 */

type Child = Node | string;

export function h(
  tag: string,
  attrs: Record<string, string> = {},
  ...children: Child[]
): HTMLElement {
  const el = document.createElement(tag);
  for (const [key, value] of Object.entries(attrs)) {
    el.setAttribute(key, value);
  }
  el.append(...children);
  return el;
}

export function link(href: string, text: string): HTMLElement {
  return h('a', { href }, text);
}

/** Add an icon link to the navbar, styled like v1's head_icon macro. */
export function addNavbarLink(href: string, title: string, icon: string): void {
  const navbar = document.querySelector('#menubar .navbar-right');
  if (!navbar) {
    return;
  }
  navbar.append(
    h(
      'li',
      {},
      h(
        'a',
        { href, title },
        h('span', { class: `fa fa-${icon} fa-2x menu-icon` }),
        h('span', { class: 'menu-text' }, title)
      )
    )
  );
}

/** Replace the contents of the status area. */
export function showStatus(root: HTMLElement, ...children: Child[]): void {
  root.replaceChildren(h('div', { class: 'nbv2-status' }, ...children));
}

/** Replace the contents of the status area with an error message. */
export function showError(
  root: HTMLElement,
  title: string,
  ...details: Child[][]
): void {
  root.replaceChildren(
    h(
      'div',
      { class: 'nbv2-error alert alert-danger', role: 'alert' },
      h('strong', {}, title),
      ...details.map(line => h('p', {}, ...line))
    )
  );
}

/** The /v2/ landing page: paste a URL, get redirected to its view. */
export function showHome(
  root: HTMLElement,
  toPath: (input: string) => string | null
): void {
  const input = h('input', {
    type: 'text',
    class: 'form-control',
    name: 'url',
    placeholder: 'URL | GitHub username | GitHub username/repo | Gist ID',
    'aria-label': 'Notebook URL, GitHub user or repository, or Gist ID'
  }) as HTMLInputElement;
  const message = h('p', { class: 'nbv2-home-message' });
  const form = h(
    'form',
    { class: 'nbv2-home-form' },
    h(
      'div',
      { class: 'input-group' },
      input,
      h(
        'span',
        { class: 'input-group-btn' },
        h('button', { type: 'submit', class: 'btn btn-default' }, 'Go!')
      )
    ),
    message
  );
  form.addEventListener('submit', event => {
    event.preventDefault();
    const path = toPath(input.value);
    if (path === null) {
      message.textContent = 'Enter a URL, a GitHub user or repository, or a Gist ID.';
      return;
    }
    window.location.assign(path);
  });
  root.replaceChildren(
    h(
      'div',
      { class: 'nbv2-home' },
      h('h1', {}, 'nbviewer v2'),
      h(
        'p',
        {},
        'An experimental nbviewer that fetches and renders notebooks in your ' +
          'browser, from URLs, GitHub repositories and gists.'
      ),
      form
    )
  );
}

/**
 * Scroll to the element named by the URL fragment, and keep it in place
 * while the cells above it finish rendering (math, images), until the user
 * scrolls. JupyterLab keeps header anchors in data-jupyter-id rather than
 * id, so the browser can't do this itself.
 */
export function scrollToFragment(root: HTMLElement): void {
  const id = decodeURIComponent(window.location.hash.slice(1));
  if (!id) {
    return;
  }
  const escaped = CSS.escape(id);
  const selector = `[data-jupyter-id="${escaped}"], [id="${escaped}"]`;
  const navbar = document.getElementById('menubar');
  // Not scrollIntoView: JupyterLab's nested overflow containers would clip
  // any scroll-margin we give the target to clear the fixed navbar.
  const scroll = () => {
    const target = root.querySelector(selector);
    if (target) {
      const offset = (navbar?.offsetHeight ?? 0) + 10;
      window.scrollTo(
        0,
        target.getBoundingClientRect().top + window.scrollY - offset
      );
    }
  };
  const observer = new ResizeObserver(scroll);
  observer.observe(root);

  const userEvents = ['wheel', 'touchstart', 'keydown', 'mousedown'];
  const stop = () => {
    observer.disconnect();
    for (const name of userEvents) {
      window.removeEventListener(name, stop);
    }
  };
  for (const name of userEvents) {
    window.addEventListener(name, stop, { passive: true });
  }
  setTimeout(stop, 10000);
}
