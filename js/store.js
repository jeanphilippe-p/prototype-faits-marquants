// Couche d'accès aux données et à l'authentification (Supabase).
(function () {
  const cfg = window.FM_CONFIG;
  let client = null;

  function getClient() {
    if (!client) {
      if (!window.supabase || !window.supabase.createClient) {
        throw new Error('Le SDK Supabase n\'a pas pu être chargé (CDN inaccessible ?).');
      }
      client = window.supabase.createClient(cfg.SUPABASE_URL, cfg.SUPABASE_KEY, {
        auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true },
      });
    }
    return client;
  }

  function explain(error) {
    const msg = (error && (error.message || error.hint || error.details)) || String(error);
    const code = error && error.code;
    if (/EMAIL_NON_AUTORISE|Database error saving new user/i.test(msg)) {
      return 'Cette adresse n\'est pas (encore) autorisée. Utilisez « Demander un accès » : un administrateur validera votre adresse.';
    }
    if (/Invalid login credentials/i.test(msg)) return 'Email ou mot de passe incorrect.';
    if (/Email not confirmed/i.test(msg)) return 'Adresse pas encore confirmée : cliquez sur le lien reçu par email.';
    if (/User already registered/i.test(msg)) return 'Un compte existe déjà pour cette adresse : connectez-vous ou utilisez « Mot de passe oublié ».';
    if (/Password should be at least/i.test(msg)) return 'Le mot de passe doit contenir au moins 8 caractères.';
    if (/rate limit|too many/i.test(msg)) return 'Trop de tentatives ou d\'emails envoyés. Réessayez dans quelques minutes.';
    if (code === '42P01' || code === 'PGRST205' || code === 'PGRST202' || /does not exist|Could not find the (table|function)/i.test(msg)) {
      return 'La base n\'est pas encore installée. Exécutez supabase/setup.sql dans le SQL Editor de Supabase.';
    }
    if (code === '42501' || /row-level security|permission denied/i.test(msg)) {
      return 'Accès refusé : votre adresse n\'est pas autorisée ou plus autorisée.';
    }
    if (/Failed to fetch|NetworkError|Load failed/i.test(msg)) return 'Impossible de joindre Supabase (réseau).';
    return msg;
  }

  async function run(promise) {
    const { data, error } = await promise;
    if (error) { const e = new Error(explain(error)); e.raw = error; throw e; }
    return data;
  }

  const Auth = {
    redirectUrl() { return window.location.origin + window.location.pathname; },
    async session() { return (await run(getClient().auth.getSession())).session; },
    onChange(cb) { getClient().auth.onAuthStateChange((event, session) => cb(event, session)); },
    signIn(email, password) { return run(getClient().auth.signInWithPassword({ email, password })); },
    signUp(email, password, nom) {
      return run(getClient().auth.signUp({ email, password, options: { data: { nom }, emailRedirectTo: Auth.redirectUrl() } }));
    },
    signOut() { return getClient().auth.signOut(); },
    resetPassword(email) { return run(getClient().auth.resetPasswordForEmail(email, { redirectTo: Auth.redirectUrl() })); },
    updatePassword(password) { return run(getClient().auth.updateUser({ password })); },
    updateName(nom) { return run(getClient().auth.updateUser({ data: { nom } })); },
    requestAccess(email, nom) { return run(getClient().rpc('demander_acces', { p_email: email, p_nom: nom })); },
    async myAccess(email) {
      const rows = await run(getClient().from('acces_utilisateurs').select('*').eq('email', String(email).toLowerCase()));
      return rows && rows[0];
    },
  };

  const Admin = {
    list() { return run(getClient().from('acces_utilisateurs').select('*').order('demande_le', { ascending: false })); },
    upsert(row) { return run(getClient().from('acces_utilisateurs').upsert(row, { onConflict: 'email' }).select()); },
    update(email, patch) { return run(getClient().from('acces_utilisateurs').update(patch).eq('email', email).select()); },
    remove(email) { return run(getClient().from('acces_utilisateurs').delete().eq('email', email)); },
  };

  const Store = {
    async list() {
      return run(getClient().from(cfg.TABLE).select('*').order('date_saisie', { ascending: false }).limit(5000));
    },
    async insert(rows) {
      return run(getClient().from(cfg.TABLE).insert(Array.isArray(rows) ? rows : [rows]).select());
    },
    async update(id, patch) {
      const data = await run(getClient().from(cfg.TABLE).update(patch).eq('id', id).select());
      if (!data || !data.length) throw new Error('Mise à jour refusée pour #' + id + ' (accès retiré ?).');
      return data[0];
    },
    async removeAll() {
      await run(getClient().from(cfg.TABLE).delete().gte('id', 0));
    },
  };

  window.FMStore = Store;
  window.FMAuth = Auth;
  window.FMAdmin = Admin;
})();
