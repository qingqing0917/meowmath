import { DatabaseSync } from 'node:sqlite';
import { readFileSync } from 'node:fs';
import worker from '../server/worker.mjs';

export function fixture() {
  const sqlite = new DatabaseSync(':memory:');
  sqlite.exec(readFileSync(new URL('../migrations/0001_initial.sql', import.meta.url), 'utf8'));
  class Statement {
    constructor(sql, args = []) { this.sql = sql; this.args = args; }
    bind(...args) { return new Statement(this.sql, args); }
    async first() { return sqlite.prepare(this.sql).get(...this.args) || null; }
    async run() {
      const result = sqlite.prepare(this.sql).run(...this.args);
      return { success: true, meta: { changes: Number(result.changes) } };
    }
  }
  const env = { APP_ENV: 'local', OWNER_EMAIL: 'owner@example.com',
    ASSETS: { fetch: () => new Response('static asset') },
    DB: {
      prepare: sql => new Statement(sql),
      async batch(statements) {
        sqlite.exec('BEGIN');
        try {
          const results = [];
          for (const statement of statements) results.push(await statement.run());
          sqlite.exec('COMMIT');
          return results;
        } catch (error) { sqlite.exec('ROLLBACK'); throw error; }
      }
    }
  };
  async function call(path, { cookie, body, method, origin = 'http://127.0.0.1:8787', host = origin } = {}) {
    const headers = new Headers({ Origin: origin });
    if (cookie) headers.set('Cookie', cookie);
    if (body !== undefined) headers.set('Content-Type', 'application/json');
    const response = await worker.fetch(new Request(host + path, {
      method: method || (body === undefined ? 'GET' : 'POST'), headers,
      body: body === undefined ? undefined : JSON.stringify(body)
    }), env);
    const data = response.headers.get('Content-Type')?.includes('json') ? await response.json() : null;
    return { status: response.status, headers: response.headers, data };
  }
  async function login(account = 'player') {
    const response = await call('/auth/local', { body: { account } });
    if (response.status !== 200) throw new Error(JSON.stringify(response.data));
    return response.headers.get('Set-Cookie').split(';')[0];
  }
  return { env, sqlite, call, login, close: () => sqlite.close() };
}
