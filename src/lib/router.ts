import { useEffect, useState } from 'react';

/** Minimal hash router — works on any static host with no server rewrites. */
export interface Route {
  path: string;
  parts: string[];
  query: URLSearchParams;
}

function parse(): Route {
  const raw = window.location.hash.replace(/^#/, '') || '/';
  const [path, qs] = raw.split('?');
  return { path, parts: path.split('/').filter(Boolean), query: new URLSearchParams(qs ?? '') };
}

export function navigate(to: string, opts: { replace?: boolean } = {}) {
  const url = `#${to.startsWith('/') ? to : `/${to}`}`;
  if (opts.replace) history.replaceState(null, '', url);
  else history.pushState(null, '', url);
  window.dispatchEvent(new HashChangeEvent('hashchange'));
}

export function useRoute() {
  const [route, setRoute] = useState<Route>(parse);
  useEffect(() => {
    const on = () => setRoute(parse());
    window.addEventListener('hashchange', on);
    window.addEventListener('popstate', on);
    return () => {
      window.removeEventListener('hashchange', on);
      window.removeEventListener('popstate', on);
    };
  }, []);
  return route;
}

export const href = (to: string) => `#${to}`;
