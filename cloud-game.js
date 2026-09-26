(function () {
  'use strict';
  const enabled = location.protocol !== 'file:';
  let user = null;
  let revision = 0;
  let pending = null;
  let timer = null;
  let queue = Promise.resolve();
  let conflict = false;
  let config;
  let staleBackup = null;
  const clone = value => JSON.parse(JSON.stringify(value));
  const cacheKey = () => `cat-cloud-v1:${user.id}`;
  const element = id => document.getElementById(id);
  function status(text, failed = false) {
    element('save-status').textContent = text;
    element('save-status').classList.toggle('save-error', failed);
    element('save-retry').hidden = !failed || conflict;
    element('save-reload').hidden = !conflict;
  }
  function cache(state, unsynced) {
    try { localStorage.setItem(cacheKey(), JSON.stringify({ state, revision, pending: unsynced })); }
    catch { status('本地缓存不可用，正在使用云端存档'); }
  }
  function serial(task) {
    const result = queue.catch(() => {}).then(task);
    queue = result;
    return result;
  }
  async function request(path, body, method = body === undefined ? 'GET' : 'POST') {
    const response = await fetch(path, { method, credentials: 'same-origin',
      headers: body === undefined ? {} : { 'Content-Type': 'application/json' },
      body: body === undefined ? undefined : JSON.stringify(body) });
    const data = await response.json();
    if (!response.ok) {
      const error = new Error(data.error || '请求失败');
      error.code = data.code;
      error.status = response.status;
      throw error;
    }
    return data;
  }
  function failed(error) {
    if (error.code === 'save_conflict') conflict = true;
    status(error.message || '网络连接失败，进度尚未同步', true);
  }
  function saved(data, state) {
    revision = data.revision;
    cache(pending || state, Boolean(pending));
    status(pending ? '等待保存' : '已保存');
  }
  function schedule(state) {
    if (!enabled || !user) return;
    pending = clone(state);
    cache(pending, true);
    if (conflict) return;
    status('等待保存');
    clearTimeout(timer);
    timer = setTimeout(() => { flush().catch(() => {}); }, 650);
  }
  async function flush() {
    clearTimeout(timer);
    if (conflict) throw new Error('请先重新加载最新存档');
    return serial(async () => {
      if (!pending) return;
      const state = pending;
      pending = null;
      status('正在保存…');
      try {
        const data = await request('/api/save', { state, revision }, 'PUT');
        state.fish = data.state.fish;
        config.getState().fish = data.state.fish;
        saved(data, state);
      } catch (error) {
        if (!pending) pending = state;
        cache(pending, true);
        failed(error);
        throw error;
      }
    });
  }
  function busy(value) {
    for (const screen of document.querySelectorAll('.screen')) screen.inert = value;
    for (const button of document.querySelectorAll('#account-bar button')) button.disabled = value;
  }
  async function action(path, payload = {}) {
    busy(true);
    try {
      await flush();
      return await serial(async () => {
        let data;
        try { data = await request(`/api/${path}`, { ...payload, revision }); }
        catch (error) {
          // A lost response may already have committed a purchase; reload before another action.
          if (!error.status || error.status >= 500) {
            conflict = true;
            error.message = '操作结果尚未确认，请重新加载云端进度';
          }
          throw error;
        }
        if (data.revision !== undefined) saved(data, data.state);
        return data;
      });
    } catch (error) { failed(error); throw error; }
    finally { busy(false); }
  }
  async function answer(roundId, payload) {
    await flush();
    return serial(async () => {
      try {
        const data = await request(`/api/rounds/${roundId}/answer`, { ...payload, revision });
        revision = data.revision;
        config.getState().fish = data.state.fish;
        cache(config.getState(), false);
        status('已保存');
        return data;
      } catch (error) { failed(error); throw error; }
    });
  }
  function exportState(state, suffix = '') {
    const blob = new Blob([JSON.stringify({ format: 'cat-game-save', version: 1,
      exportedAt: new Date().toISOString(), state }, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `cat-game${suffix}-${new Date().toISOString().slice(0, 10)}.json`;
    link.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
  async function bootstrap(options) {
    config = options;
    element('save-retry').onclick = () => flush().catch(error => config.showError(error.message));
    element('save-reload').onclick = () => {
      if (confirm('重新加载云端进度？未同步的进度可以先导出备份。')) location.reload();
    };
    element('save-export').onclick = () => exportState(config.getState());
    element('save-export-backup').onclick = () => exportState(staleBackup || pending || config.getState(), '-unsynced');
    element('save-import').onclick = () => element('save-import-file').click();
    element('save-import-file').onchange = async event => {
      const file = event.target.files[0];
      event.target.value = '';
      if (!file) return;
      try {
        if (file.size > 1000000) throw new Error('存档文件太大');
        const document = JSON.parse(await file.text());
        const state = document.format === 'cat-game-save' ? document.state : document;
        if (!state || !Array.isArray(state.cats)) throw new Error('不是有效的猫咪存档');
        if (!confirm('用这个存档替换当前账号的进度？')) return;
        if (enabled) await action('import', { state });
        else localStorage.setItem('multCatGame_v1', JSON.stringify(state));
        location.reload();
      } catch (error) { config.showError(error.message); }
    };
    if (!enabled) {
      element('account-name').textContent = '本地存档';
      status('保存在此浏览器');
      element('account-logout').hidden = true;
      element('save-import').hidden = false;
      return null;
    }
    document.body.classList.add('auth-locked');
    element('account-bar').hidden = true;
    element('auth-screen').hidden = false;
    try {
      const session = await request('/api/session');
      element('auth-local').hidden = !session.localMode;
      element('google-login').hidden = !session.googleConfigured;
      element('auth-message').textContent = session.localMode
        ? '选择测试账号' : session.googleConfigured ? '登录后继续养猫' : 'Google 登录尚未配置';
      if (new URLSearchParams(location.search).has('login_error')) {
        element('auth-message').textContent = 'Google 登录未完成，请重试';
        history.replaceState(null, '', location.pathname);
      }
      for (const button of element('auth-local').querySelectorAll('button')) {
        button.onclick = async () => {
          button.disabled = true;
          try { await request('/auth/local', { account: button.dataset.account }); location.reload(); }
          catch (error) { element('auth-message').textContent = error.message; button.disabled = false; }
        };
      }
      user = session.user;
      if (!user) return false;
      const data = await request('/api/save');
      revision = data.revision;
      let state = data.state;
      try {
        const cached = JSON.parse(localStorage.getItem(cacheKey()) || 'null');
        if (cached?.pending && cached.revision === revision) {
          state = cached.state;
          state.fish = data.state.fish;
          schedule(state);
        } else if (cached?.pending) {
          staleBackup = cached.state;
          element('save-export-backup').hidden = false;
        }
      } catch {}
      element('account-name').textContent = user.email;
      element('account-logout').hidden = false;
      element('account-logout').onclick = async () => {
        try {
          await flush();
          await request('/auth/logout', {});
          localStorage.removeItem(cacheKey());
          location.reload();
        } catch (error) { config.showError(error.message); }
      };
      element('save-import').hidden = !user.unlimitedFish;
      element('account-bar').hidden = false;
      element('auth-screen').hidden = true;
      document.body.classList.remove('auth-locked');
      if (!pending) status(staleBackup ? '发现未同步备份，可导出保存' : '已保存');
      return { state, user };
    } catch (error) {
      element('auth-message').textContent = error.message || '连接失败，请重试';
      element('auth-retry').hidden = false;
      element('auth-retry').onclick = () => location.reload();
      return false;
    }
  }
  window.CloudGame = { enabled, bootstrap, save: schedule, flush, action, answer,
    question: (roundId, a, b) => request(`/api/rounds/${roundId}/question`, { a, b }),
    get user() { return user; } };
})();
