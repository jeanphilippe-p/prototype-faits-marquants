// Couche d'accès aux données.
// Deux modes : "supabase" (base partagée) et "local" (navigateur seul,
// utile pour une démo hors ligne ou tant que la table n'existe pas).
(function () {
  const cfg = window.FM_CONFIG;
  const LOCAL_KEY = 'fm_local_data_v1';
  const MODE_KEY = 'fm_mode';

  let client = null;
  let mode = safeGet(MODE_KEY) === 'local' ? 'local' : 'supabase';

  function safeGet(k) { try { return localStorage.getItem(k); } catch (e) { return null; } }
  function safeSet(k, v) { try { localStorage.setItem(k, v); } catch (e) { /* ignore */ } }

  function getClient() {
    if (!client) {
      if (!window.supabase || !window.supabase.createClient) {
        throw new Error('Le SDK Supabase n\'a pas pu être chargé (CDN inaccessible ?).');
      }
      client = window.supabase.createClient(cfg.SUPABASE_URL, cfg.SUPABASE_KEY, {
        auth: { persistSession: false },
      });
    }
    return client;
  }

  // ---------- Mode local ----------
  function localAll() {
    try { return JSON.parse(safeGet(LOCAL_KEY) || '[]'); } catch (e) { return []; }
  }
  function localSave(rows) { safeSet(LOCAL_KEY, JSON.stringify(rows)); }
  function localNextId(rows) { return rows.reduce((m, r) => Math.max(m, r.id), 0) + 1; }

  function explain(error) {
    const msg = (error && (error.message || error.hint || error.details)) || String(error);
    const code = error && error.code;
    if (code === '42P01' || code === 'PGRST205' || /does not exist|Could not find the table/i.test(msg)) {
      return 'La table « ' + cfg.TABLE + ' » n\'existe pas encore dans Supabase. Exécutez supabase/setup.sql dans le SQL Editor.';
    }
    if (code === '42501' || /row-level security|permission denied/i.test(msg)) {
      return 'Supabase refuse l\'accès (règles RLS). Exécutez supabase/setup.sql pour ouvrir l\'accès au prototype.';
    }
    if (/Failed to fetch|NetworkError|Load failed/i.test(msg)) {
      return 'Impossible de joindre Supabase (réseau ou URL incorrecte).';
    }
    return msg;
  }

  async function run(promise) {
    const { data, error } = await promise;
    if (error) { const e = new Error(explain(error)); e.raw = error; throw e; }
    return data;
  }

  const Store = {
    get mode() { return mode; },
    setMode(m) { mode = m; safeSet(MODE_KEY, m); },

    async list() {
      if (mode === 'local') return localAll();
      return run(getClient().from(cfg.TABLE).select('*').order('date_saisie', { ascending: false }).limit(5000));
    },

    async insert(rows) {
      const list = Array.isArray(rows) ? rows : [rows];
      if (mode === 'local') {
        const all = localAll();
        const out = list.map((r) => {
          const row = Object.assign({ date_saisie: new Date().toISOString() }, r, { id: localNextId(all) });
          all.push(row);
          return row;
        });
        localSave(all);
        return out;
      }
      return run(getClient().from(cfg.TABLE).insert(list).select());
    },

    async update(id, patch) {
      if (mode === 'local') {
        const all = localAll();
        const i = all.findIndex((r) => r.id === id);
        if (i < 0) throw new Error('Fait marquant introuvable (#' + id + ').');
        all[i] = Object.assign({}, all[i], patch);
        localSave(all);
        return all[i];
      }
      const data = await run(getClient().from(cfg.TABLE).update(patch).eq('id', id).select());
      if (!data || !data.length) throw new Error('Mise à jour refusée pour #' + id + ' (règles RLS ?).');
      return data[0];
    },

    async removeAll() {
      if (mode === 'local') { localSave([]); return; }
      await run(getClient().from(cfg.TABLE).delete().gte('id', 0));
    },
  };

  window.FMStore = Store;
})();
