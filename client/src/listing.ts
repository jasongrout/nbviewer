/**
 * Listing pages (directories, repositories, gists), built with the same
 * markup and CSS classes as v1's treelist.html and tabular.html.
 */

import { h } from './page.ts';

export interface ILink {
  url: string;
  name: string;
}

export function breadcrumbs(crumbs: ILink[]): HTMLElement {
  return h(
    'ol',
    { class: 'breadcrumb' },
    ...crumbs.map(crumb => h('li', {}, h('a', { href: crumb.url }, crumb.name)))
  );
}

/** A link with a Font Awesome icon, or plain text when there is no URL. */
export function iconLink(url: string | null, icon: string, text: string): Node {
  const content = [h('i', { class: `fa fa-fw ${icon}` }), ' ', text];
  return url === null ? h('span', {}, ...content) : h('a', { href: url }, ...content);
}

export function table(
  headers: string[],
  rows: (Node | string)[][],
  pages: { prev: string | null; next: string | null } = { prev: null, next: null }
): HTMLElement {
  const body = rows.map(cells =>
    h('tr', {}, ...cells.map(cell => h('td', {}, cell)))
  );
  if (pages.prev !== null || pages.next !== null) {
    const links: (Node | string)[] = [];
    if (pages.prev !== null) {
      links.push(h('a', { href: pages.prev }, h('i', { class: 'fa fa-fw fa-angle-left' }), ' prev'));
    }
    if (pages.prev !== null && pages.next !== null) {
      links.push(' ... ');
    }
    if (pages.next !== null) {
      links.push(h('a', { href: pages.next }, 'next ', h('i', { class: 'fa fa-fw fa-angle-right' })));
    }
    body.push(
      h('tr', {}, h('td', { class: 'page_links', colspan: String(headers.length) }, ...links))
    );
  }
  return h(
    'table',
    { class: 'table table-striped table-nbviewer' },
    h('thead', {}, h('tr', {}, ...headers.map(name => h('th', {}, name)))),
    h('tbody', {}, ...body)
  );
}

/**
 * The branch/tag menu of a directory listing. Its contents are loaded the
 * first time it opens, which saves two API requests per listing.
 */
export function refMenu(
  current: string,
  load: () => Promise<{ branches: ILink[]; tags: ILink[] }>
): HTMLElement {
  const toggle = h('a', { class: 'dropdown-toggle', role: 'button', 'aria-haspopup': 'true', 'aria-expanded': 'false', tabindex: '0' }, current, ' ', h('span', { class: 'caret' }));
  const row = h('div', { class: 'row' }, h('div', { class: 'col-md-12' }, 'Loading…'));
  const menu = h('div', { class: 'dropdown-menu', role: 'menu' }, h('div', { class: 'container-fluid' }, row));
  const dropdown = h('div', { class: 'pull-right dropdown dropdown-ref' }, toggle, menu);

  let loaded = false;
  const setOpen = (open: boolean) => {
    dropdown.classList.toggle('open', open);
    toggle.setAttribute('aria-expanded', String(open));
  };
  const onToggle = (event: Event) => {
    event.preventDefault();
    setOpen(!dropdown.classList.contains('open'));
    if (loaded) {
      return;
    }
    loaded = true;
    load().then(
      ({ branches, tags }) =>
        row.replaceChildren(refList('branch', branches), refList('tag', tags)),
      (err: Error) => {
        loaded = false;
        row.replaceChildren(h('div', { class: 'col-md-12' }, err.message));
      }
    );
  };
  toggle.addEventListener('click', onToggle);
  toggle.addEventListener('keydown', event => {
    if (event.key === 'Enter' || event.key === ' ') {
      onToggle(event);
    }
  });
  document.addEventListener('click', event => {
    if (!dropdown.contains(event.target as Node)) {
      setOpen(false);
    }
  });
  return h('div', { class: 'breadcrumb pull-right' }, dropdown);
}

function refList(label: string, refs: ILink[]): HTMLElement {
  return h(
    'div',
    { class: 'col-md-6' },
    h('h5', { class: 'nav-header' }, label),
    h('ul', {}, ...refs.map(ref => h('li', {}, h('a', { href: ref.url }, ref.name))))
  );
}
