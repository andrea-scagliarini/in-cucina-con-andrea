/** Router minimale con parametri di percorso (/recipes/:id). */
export class Router {
  #routes = [];

  add(method, path, ...handlers) {
    const keys = [];
    const pattern = path.replace(/:([A-Za-z_]+)/g, (_, k) => (keys.push(k), '([^/]+)'));
    this.#routes.push({ method, re: new RegExp(`^${pattern}/?$`), keys, handlers });
    return this;
  }

  get = (p, ...h) => this.add('GET', p, ...h);
  post = (p, ...h) => this.add('POST', p, ...h);
  put = (p, ...h) => this.add('PUT', p, ...h);
  delete = (p, ...h) => this.add('DELETE', p, ...h);

  /** Restituisce { handlers, params } oppure { methodNotAllowed } / null. */
  match(method, pathname) {
    let pathMatched = false;
    for (const r of this.#routes) {
      const m = r.re.exec(pathname);
      if (!m) continue;
      pathMatched = true;
      const reqMethod = method === 'HEAD' ? 'GET' : method;
      if (r.method !== reqMethod) continue;
      const params = {};
      r.keys.forEach((k, i) => (params[k] = decodeURIComponent(m[i + 1])));
      return { handlers: r.handlers, params };
    }
    return pathMatched ? { methodNotAllowed: true } : null;
  }
}

/** Esegue la catena di handler (middleware-style): ogni handler può restituire un valore finale. */
export async function runChain(handlers, ctx) {
  for (const h of handlers) {
    const out = await h(ctx);
    if (out !== undefined) return out;
  }
  return undefined;
}
