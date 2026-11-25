/** Server-Sent Events: broadcast in tempo reale (like, commenti, nuove ricette). */
export class EventHub {
  #clients = new Set();

  constructor() {
    this.heartbeat = setInterval(() => {
      for (const res of this.#clients) res.write(': ping\n\n');
    }, 25_000);
    this.heartbeat.unref();
  }

  get size() {
    return this.#clients.size;
  }

  subscribe(req, res) {
    res.writeHead(200, {
      'Content-Type': 'text/event-stream; charset=utf-8',
      'Cache-Control': 'no-cache, no-transform',
      Connection: 'keep-alive',
      'X-Accel-Buffering': 'no',
    });
    res.write('retry: 4000\n\n');
    this.#clients.add(res);
    req.on('close', () => this.#clients.delete(res));
  }

  broadcast(type, data) {
    const frame = `event: ${type}\ndata: ${JSON.stringify(data)}\n\n`;
    for (const res of this.#clients) res.write(frame);
  }

  close() {
    clearInterval(this.heartbeat);
    for (const res of this.#clients) res.end();
    this.#clients.clear();
  }
}
