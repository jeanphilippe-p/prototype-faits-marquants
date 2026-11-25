/* Faits Marquants – prototype (HTML/CSS/JS vanilla) */
(function () {
  'use strict';

  // ===================================================================
  // Référentiels
  // ===================================================================
  const ZONES = ['SUD-OUEST', 'SUD-EST', 'CENTRE-OUEST', 'NORD', 'CARAÏBES', 'RÉUNION', 'NOUV.CAL.', 'O3C', 'PEO', 'TRANSVERSE'];
  const CATEGORIES = ['RH', 'HSE', 'Réglementaire', 'Contractuel / Sous-traitants', 'Projets Transverses', 'Actifs', 'Digital & Outils', 'Relations', 'CODEM', 'Divers'];
  const PRIORITES = ['Normal', 'Important', 'Critique'];
  const STATUTS = ['Saisi', 'Validé N-1', 'Remonté N+1', 'Archivé'];
  const PRIO_RANK = { Critique: 0, Important: 1, Normal: 2 };
  const IMPORT_FIELDS = ['semaine', 'auteur', 'zone', 'categorie', 'titre', 'description', 'priorite', 'pieces_jointes'];

  const ROLE_LABEL = { collab: 'Collaborateur', manager: 'Manager N-1', directeur: 'Directeur N', lecteur: 'Lecteur N+1' };
  const DEFAULT_IDENTITY = {
    collab: 'Camille Martin – Maintenance Sud-Ouest',
    manager: 'Responsable de zone – Exploitation',
    directeur: 'JP – Directeur Exploitation & Maintenance',
    lecteur: 'Lecteur N+1',
  };

  // ===================================================================
  // État
  // ===================================================================
  const state = {
    rows: [],
    role: lsGet('fm_role') || 'collab',
    identities: Object.assign({}, DEFAULT_IDENTITY, lsJson('fm_identities', {})),
    selected: new Set(),
    filters: { semaine: '', zone: '', categorie: '', priorite: '', q: '' },
    perimetre: lsGet('fm_perimetre') || '',
    showAllCollab: false,
    synthWeek: '',
    importRows: null,
    formPrio: 'Normal',
    loading: false,
    lastError: null,
  };
  if (!ROLE_LABEL[state.role]) state.role = 'collab';

  function lsGet(k) { try { return localStorage.getItem(k); } catch (e) { return null; } }
  function lsSet(k, v) { try { localStorage.setItem(k, v); } catch (e) { /* ignore */ } }
  function lsJson(k, d) { try { return JSON.parse(lsGet(k)) || d; } catch (e) { return d; } }

  const $ = (s, el) => (el || document).querySelector(s);
  const $$ = (s, el) => Array.from((el || document).querySelectorAll(s));
  const me = () => (state.identities[state.role] || '').trim() || ROLE_LABEL[state.role];

  // ===================================================================
  // Utilitaires
  // ===================================================================
  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  }
  function norm(s) {
    return String(s == null ? '' : s).normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9+&]/g, '');
  }
  function isoWeek(d) {
    const date = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
    const day = date.getUTCDay() || 7;
    date.setUTCDate(date.getUTCDate() + 4 - day);
    const yearStart = new Date(Date.UTC(date.getUTCFullYear(), 0, 1));
    const week = Math.ceil(((date - yearStart) / 86400000 + 1) / 7);
    return date.getUTCFullYear() + '-W' + String(week).padStart(2, '0');
  }
  function weekMonday(w) {
    const m = /^(\d{4})-W(\d{2})$/.exec(w || '');
    if (!m) return null;
    const jan4 = new Date(Date.UTC(+m[1], 0, 4));
    const mon = new Date(jan4);
    mon.setUTCDate(jan4.getUTCDate() - ((jan4.getUTCDay() || 7) - 1) + (+m[2] - 1) * 7);
    return mon;
  }
  function weekLabel(w) {
    const mon = weekMonday(w);
    if (!mon) return w;
    const sun = new Date(mon); sun.setUTCDate(mon.getUTCDate() + 6);
    const f = (d) => d.toLocaleDateString('fr-FR', { day: 'numeric', month: 'short', timeZone: 'UTC' });
    return w + ' (' + f(mon) + ' – ' + f(sun) + ')';
  }
  function weeksAround(n) {
    const out = [];
    const d = new Date();
    d.setDate(d.getDate() + 7);
    for (let i = 0; i < n; i++) { out.push(isoWeek(d)); d.setDate(d.getDate() - 7); }
    return out;
  }
  const CURRENT_WEEK = isoWeek(new Date());
  function fmtDate(iso) {
    if (!iso) return '';
    const d = new Date(iso);
    return d.toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit', year: 'numeric' }) + ' ' +
      d.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });
  }
  function fmtShort(iso) {
    if (!iso) return '';
    return new Date(iso).toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit' });
  }
  function matchEnum(value, list) {
    const n = norm(value);
    if (!n) return null;
    return list.find((x) => norm(x) === n) ||
      list.find((x) => norm(x).startsWith(n) || n.startsWith(norm(x))) || null;
  }
  function hist(action, commentaire) {
    return { date: new Date().toISOString(), auteur: me(), action, commentaire: commentaire || '' };
  }
  function linksOf(fm) {
    const p = fm.pieces_jointes;
    if (!p) return [];
    if (Array.isArray(p)) return p.filter(Boolean);
    if (typeof p === 'string') return p.split(/\r?\n|\s\|\s/).map((s) => s.trim()).filter(Boolean);
    return [];
  }
  function download(name, content, type) {
    const blob = new Blob([content], { type });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = name;
    document.body.appendChild(a);
    a.click();
    setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 500);
  }
  function toast(msg, isErr) {
    const t = document.createElement('div');
    t.className = 'toast' + (isErr ? ' err' : '');
    t.textContent = msg;
    $('#toasts').appendChild(t);
    setTimeout(() => t.remove(), isErr ? 7000 : 3500);
  }

  // ===================================================================
  // Règles métier
  // ===================================================================
  // Le rejet ne crée pas de statut supplémentaire (le modèle de données
  // impose 4 statuts) : un FM rejeté reste "Saisi" et sa dernière action
  // de workflow est "Rejeté". Toute modification le renvoie en validation.
  function isRejected(fm) {
    if (fm.statut !== 'Saisi') return false;
    const h = fm.historique || [];
    for (let i = h.length - 1; i >= 0; i--) {
      if (h[i].action === 'Commentaire') continue;
      return h[i].action === 'Rejeté';
    }
    return false;
  }
  function wasRaised(fm) {
    return fm.statut === 'Remonté N+1' ||
      (fm.statut === 'Archivé' && (fm.historique || []).some((h) => h.action === 'Remonté N+1'));
  }
  function stage(fm) {
    if (fm.statut === 'Saisi') return isRejected(fm) ? 'rejete' : 'saisi';
    return { 'Validé N-1': 'valide', 'Remonté N+1': 'remonte', 'Archivé': 'archive' }[fm.statut] || 'saisi';
  }
  const STAGE_LABEL = { saisi: 'À valider', rejete: 'Rejeté', valide: 'Validé N-1', remonte: 'Remonté N+1', archive: 'Archivé' };
  function lastEntry(fm) { const h = fm.historique || []; return h[h.length - 1]; }
  function sortFm(a, b) {
    return (PRIO_RANK[a.priorite] - PRIO_RANK[b.priorite]) || String(b.date_saisie).localeCompare(String(a.date_saisie));
  }

  async function changeStatus(fm, statut, action, commentaire) {
    const patch = { historique: (fm.historique || []).concat([hist(action, commentaire)]) };
    if (statut) patch.statut = statut;
    return save(fm.id, patch);
  }
  async function save(id, patch) {
    const row = await FMStore.update(id, patch);
    const i = state.rows.findIndex((r) => r.id === id);
    if (i >= 0) state.rows[i] = row;
    return row;
  }
  async function bulk(ids, fn, okMsg) {
    let ok = 0;
    const errors = [];
    for (const id of ids) {
      const fm = state.rows.find((r) => r.id === id);
      if (!fm) continue;
      try { await fn(fm); ok++; } catch (e) { errors.push(e.message); }
    }
    state.selected.clear();
    render();
    if (ok) toast(okMsg.replace('{n}', ok));
    if (errors.length) toast(errors[0], true);
  }

  // ===================================================================
  // Chargement
  // ===================================================================
  async function load(quiet) {
    state.loading = true;
    renderConn();
    try {
      state.rows = (await FMStore.list()) || [];
      state.rows.forEach((r) => { if (!Array.isArray(r.historique)) r.historique = []; });
      state.lastError = null;
    } catch (e) {
      state.lastError = e.message;
      if (!quiet) toast(e.message, true);
    }
    state.loading = false;
    for (const id of Array.from(state.selected)) if (!state.rows.some((r) => r.id === id)) state.selected.delete(id);
    render();
  }

  function renderConn() {
    const el = $('#conn');
    const banner = $('#banner');
    if (FMStore.mode === 'local') {
      el.className = 'conn local';
      el.textContent = 'Mode local';
      banner.hidden = false;
      banner.innerHTML = '<span><strong>Mode local :</strong> les données restent dans ce navigateur et ne sont pas partagées.</span>' +
        '<button class="btn sm" data-action="toggle-mode">Revenir sur Supabase</button>';
      return;
    }
    if (state.lastError) {
      el.className = 'conn err';
      el.textContent = 'Supabase : erreur';
      banner.hidden = false;
      banner.innerHTML = '<span><strong>Supabase indisponible.</strong> ' + esc(state.lastError) +
        '</span>' +
        '<button class="btn sm" data-action="refresh">Réessayer</button>' +
        '<button class="btn sm" data-action="toggle-mode">Continuer en mode local</button>';
      return;
    }
    el.className = 'conn ok';
    el.textContent = state.loading ? 'Supabase…' : 'Supabase · ' + state.rows.length + ' FM';
    banner.hidden = true;
  }

  // ===================================================================
  // Rendu général
  // ===================================================================
  function render() {
    renderConn();
    $$('.roles button').forEach((b) => b.setAttribute('aria-selected', String(b.dataset.role === state.role)));
    $('#identity').value = state.identities[state.role] || '';
    const viewKey = state.role === 'manager' || state.role === 'directeur' ? 'board' : state.role;
    $$('.view').forEach((v) => { v.hidden = v.dataset.view !== viewKey; });
    if (state.role === 'collab') renderCollab();
    else if (state.role === 'lecteur') renderSynthesis();
    else renderBoard();
  }

  // ---------- Carte ----------
  function cardHtml(fm, opts) {
    opts = opts || {};
    const st = stage(fm);
    const last = lastEntry(fm);
    const validation = (fm.historique || []).filter((h) => h.action === 'Validé N-1').pop();
    const created = (fm.historique || [])[0];
    let histLine = '';
    if (last) {
      histLine = '<div class="card-hist"><span class="' + (last.action === 'Rejeté' ? 'reject' : '') + '"><b>' + esc(last.action) + '</b> par ' +
        esc(last.auteur) + ' · ' + fmtShort(last.date) + '</span>' +
        (last.action === 'Rejeté' && last.commentaire ? '<br><span class="reject">« ' + esc(last.commentaire) + ' »</span>' : '') +
        (validation && last !== validation ? '<br>Validé par ' + esc(validation.auteur) : '') +
        (created && created !== last && opts.showCreator ? '<br>Créé par ' + esc(created.auteur) : '') +
        '</div>';
    }
    const sel = state.selected.has(fm.id);
    return '<div class="card p-' + esc(fm.priorite) + (sel ? ' selected' : '') + '" data-id="' + fm.id + '" tabindex="0">' +
      '<div class="card-top">' +
        (opts.selectable ? '<input type="checkbox" data-select="' + fm.id + '"' + (sel ? ' checked' : '') + ' aria-label="Sélectionner">' : '') +
        '<div class="card-title">' + esc(fm.titre) + ' <span class="card-id">#' + fm.id + '</span></div>' +
      '</div>' +
      '<div class="chips"><span class="chip zone">' + esc(fm.zone) + '</span><span class="chip">' + esc(fm.categorie) + '</span>' +
        (fm.priorite !== 'Normal' ? '<span class="chip ' + esc(fm.priorite) + '">' + esc(fm.priorite) + '</span>' : '') +
        (opts.showStatus ? '<span class="chip st-' + st + '">' + STAGE_LABEL[st] + '</span>' : '') +
      '</div>' +
      (fm.description ? '<div class="card-desc">' + esc(fm.description) + '</div>' : '') +
      '<div class="card-meta">' + esc(fm.auteur) + ' · ' + esc(fm.semaine) + (linksOf(fm).length ? ' · 📎 ' + linksOf(fm).length : '') + '</div>' +
      histLine +
      (opts.actions ? '<div class="card-actions">' + opts.actions + '</div>' : '') +
    '</div>';
  }

  // ===================================================================
  // Vue Collaborateur
  // ===================================================================
  function fillSelect(sel, values, current, emptyLabel) {
    sel.innerHTML = (emptyLabel != null ? '<option value="">' + esc(emptyLabel) + '</option>' : '') +
      values.map((v) => {
        const val = typeof v === 'object' ? v.value : v;
        const lab = typeof v === 'object' ? v.label : v;
        return '<option value="' + esc(val) + '"' + (val === current ? ' selected' : '') + '>' + esc(lab) + '</option>';
      }).join('');
  }

  function setupForm() {
    const f = $('#fmForm');
    fillSelect(f.semaine, weeksAround(9).map((w) => ({ value: w, label: weekLabel(w) })), CURRENT_WEEK);
    fillSelect(f.zone, ZONES, lsGet('fm_last_zone') || '', 'Choisir…');
    fillSelect(f.categorie, CATEGORIES, '', 'Choisir…');
    $('#prioSeg').innerHTML = PRIORITES.map((p) => '<button type="button" data-v="' + p + '">' + p + '</button>').join('');
    setPrio('Normal');
  }
  function setPrio(p) {
    state.formPrio = p;
    $$('#prioSeg button').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.v === p)));
  }
  function updateCount() {
    const n = $('#fmForm').titre.value.length;
    const c = $('#titleCount');
    c.textContent = n + ' / 120';
    c.classList.toggle('over', n >= 120);
  }
  function resetForm() {
    const f = $('#fmForm');
    f.reset();
    f.id.value = '';
    f.semaine.value = CURRENT_WEEK;
    f.zone.value = lsGet('fm_last_zone') || '';
    setPrio('Normal');
    $('#formTitle').textContent = 'Nouveau fait marquant';
    $('#formSubmit').textContent = 'Enregistrer';
    updateCount();
  }
  function editInForm(fm) {
    const f = $('#fmForm');
    if (![...f.semaine.options].some((o) => o.value === fm.semaine)) {
      f.semaine.insertAdjacentHTML('beforeend', '<option value="' + esc(fm.semaine) + '">' + esc(weekLabel(fm.semaine)) + '</option>');
    }
    f.id.value = fm.id;
    f.semaine.value = fm.semaine;
    f.zone.value = fm.zone;
    f.categorie.value = fm.categorie;
    f.titre.value = fm.titre;
    f.description.value = fm.description || '';
    f.pieces_jointes.value = linksOf(fm).join('\n');
    setPrio(fm.priorite);
    $('#formTitle').textContent = 'Modifier le fait marquant #' + fm.id;
    $('#formSubmit').textContent = 'Enregistrer les modifications';
    updateCount();
    f.scrollIntoView({ behavior: 'smooth', block: 'start' });
    f.titre.focus();
  }

  function describeChanges(before, after) {
    const labels = { semaine: 'semaine', zone: 'zone', categorie: 'catégorie', titre: 'titre', description: 'description', priorite: 'priorité', pieces_jointes: 'pièces jointes' };
    return Object.keys(labels).filter((k) => JSON.stringify(before[k] || '') !== JSON.stringify(after[k] || ''))
      .map((k) => k === 'description' || k === 'pieces_jointes' ? labels[k] : labels[k] + ' : ' + (before[k] || '—') + ' → ' + after[k])
      .join(' ; ');
  }

  async function submitForm(ev) {
    if (ev) ev.preventDefault();
    const f = $('#fmForm');
    const data = {
      semaine: f.semaine.value,
      zone: f.zone.value,
      categorie: f.categorie.value,
      titre: f.titre.value.trim(),
      description: f.description.value.trim(),
      priorite: state.formPrio,
      pieces_jointes: f.pieces_jointes.value.split(/\r?\n/).map((s) => s.trim()).filter(Boolean),
    };
    if (!data.zone || !data.categorie || !data.titre) { toast('Zone, catégorie et titre sont obligatoires.', true); return; }
    const btn = $('#formSubmit');
    btn.disabled = true;
    try {
      const id = f.id.value ? Number(f.id.value) : null;
      if (id) {
        const fm = state.rows.find((r) => r.id === id);
        const changes = describeChanges(fm, data);
        if (!changes) { toast('Aucune modification.'); resetForm(); return; }
        const wasRej = isRejected(fm);
        data.historique = (fm.historique || []).concat([hist('Modifié', changes + (wasRej ? ' (renvoyé en validation)' : ''))]);
        await save(id, data);
        toast('Fait marquant #' + id + ' mis à jour.');
      } else {
        data.auteur = me();
        data.statut = 'Saisi';
        data.historique = [hist('Créé', state.role === 'manager' ? 'Saisi par le manager' : '')];
        const [row] = await FMStore.insert(data);
        state.rows.unshift(row);
        toast('Fait marquant #' + row.id + ' enregistré.');
      }
      lsSet('fm_last_zone', data.zone);
      resetForm();
      if (state.role === 'manager') { closeModal(); }
      render();
    } catch (e) {
      toast(e.message, true);
    } finally {
      btn.disabled = false;
    }
  }

  function renderCollab() {
    const mine = state.showAllCollab ? state.rows.slice() : state.rows.filter((r) => norm(r.auteur) === norm(me()));
    mine.sort((a, b) => String(b.date_saisie).localeCompare(String(a.date_saisie)));
    $('#collabList').innerHTML = mine.length
      ? mine.map((fm) => {
          const mineFm = norm(fm.auteur) === norm(me());
          const editable = mineFm && fm.statut === 'Saisi';
          return cardHtml(fm, {
            showStatus: true,
            actions: editable ? '<button type="button" class="btn sm" data-act="edit" data-id="' + fm.id + '">Modifier</button>' : '',
          });
        }).join('')
      : '<div class="empty">Aucun fait marquant pour « ' + esc(me()) + ' ». Saisissez-en un ci-dessus, importez un fichier, ou générez des données de test (menu ⋯).</div>';
    renderImportPreview();
  }

  // ---------- Import ----------
  function parseCsv(text) {
    text = text.replace(/^﻿/, '');
    const firstLine = text.split(/\r?\n/)[0] || '';
    const delim = (firstLine.match(/;/g) || []).length >= (firstLine.match(/,/g) || []).length ? ';' : ',';
    const rows = [];
    let row = [], field = '', inQ = false;
    for (let i = 0; i < text.length; i++) {
      const c = text[i];
      if (inQ) {
        if (c === '"') { if (text[i + 1] === '"') { field += '"'; i++; } else inQ = false; }
        else field += c;
      } else if (c === '"') inQ = true;
      else if (c === delim) { row.push(field); field = ''; }
      else if (c === '\n' || c === '\r') {
        if (c === '\r' && text[i + 1] === '\n') i++;
        row.push(field); field = '';
        if (row.some((x) => x.trim() !== '')) rows.push(row);
        row = [];
      } else field += c;
    }
    row.push(field);
    if (row.some((x) => x.trim() !== '')) rows.push(row);
    if (!rows.length) return [];
    const header = rows[0].map((h) => {
      const n = norm(h);
      return IMPORT_FIELDS.find((f) => norm(f) === n) || (n === 'categories' ? 'categorie' : n === 'piecesjointes' || n === 'liens' ? 'pieces_jointes' : n);
    });
    return rows.slice(1).map((r) => {
      const o = {};
      header.forEach((h, i) => { o[h] = (r[i] || '').trim(); });
      return o;
    });
  }

  function normalizeImport(raw) {
    const errors = [];
    const g = (k) => {
      const v = raw[k] != null ? raw[k] : raw[Object.keys(raw).find((x) => norm(x) === norm(k))];
      return v == null ? '' : v;
    };
    let semaine = String(g('semaine')).trim().toUpperCase();
    if (!semaine) semaine = CURRENT_WEEK;
    const m = /^(\d{4})-?W?(\d{1,2})$/.exec(semaine);
    if (m) semaine = m[1] + '-W' + m[2].padStart(2, '0');
    if (!/^\d{4}-W\d{2}$/.test(semaine)) errors.push('semaine invalide');
    const zone = matchEnum(g('zone').replace(/[()]/g, ''), ZONES);
    if (!zone) errors.push('zone inconnue « ' + g('zone') + ' »');
    const categorie = matchEnum(g('categorie'), CATEGORIES);
    if (!categorie) errors.push('catégorie inconnue « ' + g('categorie') + ' »');
    const prioRaw = g('priorite');
    const priorite = prioRaw ? matchEnum(prioRaw, PRIORITES) : 'Normal';
    if (!priorite) errors.push('priorité inconnue « ' + prioRaw + ' »');
    const titre = String(g('titre')).trim();
    if (!titre) errors.push('titre manquant');
    if (titre.length > 120) errors.push('titre > 120 caractères');
    const pj = g('pieces_jointes');
    const pieces = Array.isArray(pj) ? pj : String(pj).split(/\s*[|\n]\s*/).map((s) => s.trim()).filter(Boolean);
    return {
      errors,
      row: {
        semaine, zone, categorie, titre, priorite: priorite || 'Normal',
        description: String(g('description')).trim(),
        auteur: String(g('auteur')).trim() || me(),
        pieces_jointes: pieces,
      },
    };
  }

  async function handleImportFile(file) {
    if (!file) return;
    const text = await file.text();
    let raws;
    try {
      if (/\.json$/i.test(file.name) || /^\s*[[{]/.test(text)) {
        const j = JSON.parse(text);
        raws = Array.isArray(j) ? j : (j.faits_marquants || j.items || [j]);
      } else {
        raws = parseCsv(text);
      }
    } catch (e) {
      toast('Fichier illisible : ' + e.message, true);
      return;
    }
    if (!raws.length) { toast('Aucune ligne trouvée dans le fichier.', true); return; }
    state.importRows = raws.map(normalizeImport);
    state.importFile = file.name;
    renderImportPreview();
  }

  function renderImportPreview() {
    const box = $('#importPreview');
    const rows = state.importRows;
    if (!rows) { box.innerHTML = ''; return; }
    const ok = rows.filter((r) => !r.errors.length).length;
    box.innerHTML =
      '<div class="preview-wrap"><table class="preview-table"><thead><tr><th>#</th><th>Semaine</th><th>Zone</th><th>Catégorie</th><th>Titre</th><th>Contrôle</th></tr></thead><tbody>' +
      rows.map((r, i) => '<tr class="' + (r.errors.length ? 'bad' : '') + '"><td>' + (i + 1) + '</td><td>' + esc(r.row.semaine) + '</td><td>' + esc(r.row.zone || '—') +
        '</td><td>' + esc(r.row.categorie || '—') + '</td><td>' + esc(r.row.titre) + '</td><td>' + (r.errors.length ? esc(r.errors.join(', ')) : '✓') + '</td></tr>').join('') +
      '</tbody></table></div>' +
      '<div class="preview-sum"><span><strong>' + ok + '</strong> ligne(s) valide(s) sur ' + rows.length + ' · ' + esc(state.importFile) + '</span>' +
      '<span><button type="button" class="btn ghost" data-action="import-cancel">Annuler</button> ' +
      '<button type="button" class="btn primary" data-action="import-go"' + (ok ? '' : ' disabled') + '>Importer ' + ok + ' FM</button></span></div>';
  }

  async function doImport() {
    const valid = (state.importRows || []).filter((r) => !r.errors.length).map((r) => Object.assign({}, r.row, {
      statut: 'Saisi',
      historique: [hist('Importé', 'Import ' + (state.importFile || 'fichier') + (r.row.auteur !== me() ? ' (auteur : ' + r.row.auteur + ')' : ''))],
    }));
    if (!valid.length) return;
    try {
      const inserted = await FMStore.insert(valid);
      state.rows = inserted.concat(state.rows);
      state.importRows = null;
      toast(inserted.length + ' fait(s) marquant(s) importé(s).');
      render();
    } catch (e) { toast(e.message, true); }
  }

  function templateRows() {
    return [
      { semaine: CURRENT_WEEK, auteur: 'Camille Martin – Maintenance Sud-Ouest', zone: 'SUD-OUEST', categorie: 'HSE', titre: 'Presque-accident lors d\'une consignation électrique', description: 'Écart de procédure détecté avant intervention. Rappel des règles fait en causerie sécurité.', priorite: 'Important', pieces_jointes: 'https://intranet/rapport-123' },
      { semaine: CURRENT_WEEK, auteur: 'Camille Martin – Maintenance Sud-Ouest', zone: 'SUD-OUEST', categorie: 'Actifs', titre: 'Remplacement du transformateur T2 terminé', description: 'Mise en service le jeudi, sans incident.', priorite: 'Normal', pieces_jointes: '' },
    ];
  }
  function csvEscape(v) { v = String(v == null ? '' : v); return /[";\n\r]/.test(v) ? '"' + v.replace(/"/g, '""') + '"' : v; }
  function downloadTemplate(kind) {
    if (kind === 'json') {
      download('modele_faits_marquants.json', JSON.stringify(templateRows().map((r) => Object.assign({}, r, { pieces_jointes: r.pieces_jointes ? [r.pieces_jointes] : [] })), null, 2), 'application/json');
    } else {
      const lines = [IMPORT_FIELDS.join(';')].concat(templateRows().map((r) => IMPORT_FIELDS.map((f) => csvEscape(r[f])).join(';')));
      download('modele_faits_marquants.csv', '﻿' + lines.join('\r\n') + '\r\n', 'text/csv;charset=utf-8');
    }
  }
  function copilotPrompt() {
    return 'À partir de mes notes, mails et réunions de la semaine, liste mes faits marquants sous forme de tableau CSV ' +
      '(séparateur point-virgule, une ligne par fait marquant, première ligne = en-têtes) avec exactement ces colonnes :\n' +
      IMPORT_FIELDS.join(';') + '\n\n' +
      'Règles :\n' +
      '- semaine : format ISO AAAA-Www (ex. ' + CURRENT_WEEK + ')\n' +
      '- auteur : mon nom + mon service\n' +
      '- zone : une valeur parmi ' + ZONES.join(' | ') + '\n' +
      '- categorie : une valeur parmi ' + CATEGORIES.join(' | ') + '\n' +
      '- titre : 120 caractères maximum, factuel\n' +
      '- description : faits, impact, actions engagées (entre guillemets si elle contient un point-virgule)\n' +
      '- priorite : Normal | Important | Critique\n' +
      '- pieces_jointes : liens séparés par " | " (laisser vide si aucun)\n' +
      'Ne retiens que les faits significatifs pour ma hiérarchie.';
  }

  // ===================================================================
  // Vues Manager / Directeur (Kanban)
  // ===================================================================
  function weeksInData() {
    const s = new Set(state.rows.map((r) => r.semaine).filter(Boolean));
    s.add(CURRENT_WEEK);
    return Array.from(s).sort().reverse();
  }
  function applyFilters(rows) {
    const f = state.filters;
    const q = norm(f.q);
    return rows.filter((r) =>
      (!f.semaine || r.semaine === f.semaine) &&
      (!f.zone || r.zone === f.zone) &&
      (!f.categorie || r.categorie === f.categorie) &&
      (!f.priorite || r.priorite === f.priorite) &&
      (!q || norm(r.titre + ' ' + r.description + ' ' + r.auteur + ' #' + r.id).includes(q)));
  }

  function renderFilters() {
    const f = state.filters;
    const opt = (vals, cur, all) => '<option value="">' + all + '</option>' + vals.map((v) => {
      const val = typeof v === 'object' ? v.value : v; const lab = typeof v === 'object' ? v.label : v;
      return '<option value="' + esc(val) + '"' + (val === cur ? ' selected' : '') + '>' + esc(lab) + '</option>';
    }).join('');
    const perim = state.role === 'manager'
      ? '<label>Mon équipe (périmètre) <span class="guess">hypothèse : 1 équipe = 1 zone</span><select data-perim>' + opt(ZONES, state.perimetre, 'Toutes les zones') + '</select></label>'
      : '';
    const html = perim +
      '<label>Semaine<select data-filter="semaine">' + opt(weeksInData().map((w) => ({ value: w, label: weekLabel(w) })), f.semaine, 'Toutes les semaines') + '</select></label>' +
      (state.role === 'manager' ? '' : '<label>Zone<select data-filter="zone">' + opt(ZONES, f.zone, 'Toutes les zones') + '</select></label>') +
      '<label>Catégorie<select data-filter="categorie">' + opt(CATEGORIES, f.categorie, 'Toutes') + '</select></label>' +
      '<label>Priorité<select data-filter="priorite">' + opt(PRIORITES, f.priorite, 'Toutes') + '</select></label>' +
      '<label class="search">Recherche<input data-filter="q" type="search" placeholder="Titre, auteur, n°…" value="' + esc(f.q) + '"></label>';
    const box = $('#filters');
    const active = document.activeElement;
    const keepSearch = active && active.dataset && active.dataset.filter === 'q';
    const caret = keepSearch ? active.selectionStart : 0;
    box.innerHTML = html;
    if (keepSearch) { const i = $('[data-filter="q"]', box); i.focus(); i.setSelectionRange(caret, caret); }
  }

  function column(key, title, rows, opts) {
    return '<div class="col ' + key + '" data-col="' + key + '">' +
      '<div class="col-head"><h3>' + title + '</h3><span class="n">' + rows.length + '</span>' + (opts.head || '') + '</div>' +
      '<div class="col-body">' + (rows.length ? rows.map((fm) => cardHtml(fm, opts.card(fm))).join('') : '<div class="empty">' + (opts.empty || 'Aucun fait marquant') + '</div>') + '</div>' +
    '</div>';
  }

  function renderBoard() {
    renderFilters();
    let rows = applyFilters(state.rows);
    const isManager = state.role === 'manager';
    if (isManager && state.perimetre) rows = rows.filter((r) => r.zone === state.perimetre);
    rows.sort(sortFm);
    const by = { saisi: [], rejete: [], valide: [], remonte: [], archive: [] };
    rows.forEach((r) => by[stage(r)].push(r));
    // On ne garde dans la sélection que ce qui est visible.
    const visible = new Set(rows.map((r) => r.id));
    for (const id of Array.from(state.selected)) if (!visible.has(id)) state.selected.delete(id);
    const sel = Array.from(state.selected).map((id) => state.rows.find((r) => r.id === id)).filter(Boolean);
    const selAll = (key) => '<button type="button" class="btn sm ghost col-act" data-selall="' + key + '">Tout cocher</button>';

    let toolbar = '', board = '';
    if (isManager) {
      const canValidate = sel.length && sel.every((r) => r.statut === 'Saisi');
      const canMerge = sel.length === 2 && sel.every((r) => r.statut === 'Saisi' || r.statut === 'Validé N-1');
      toolbar =
        '<span class="sel-count">' + sel.length + ' sélectionné(s)</span>' +
        '<button class="btn ok" data-action="bulk-validate"' + (canValidate ? '' : ' disabled') + '>✓ Valider la sélection</button>' +
        '<button class="btn danger" data-action="bulk-reject"' + (canValidate ? '' : ' disabled') + '>✕ Rejeter…</button>' +
        '<button class="btn" data-action="merge"' + (canMerge ? '' : ' disabled') + ' title="Sélectionnez exactement 2 FM">⇄ Fusionner les 2 FM</button>' +
        (sel.length ? '<button class="btn ghost" data-action="clear-sel">Désélectionner</button>' : '') +
        '<span class="spacer"></span>' +
        '<button class="btn primary" data-action="manager-add">+ Ajouter mon fait marquant</button>';
      const actSaisi = (fm) => ({ selectable: true, actions:
        '<button type="button" class="btn ok" data-act="validate" data-id="' + fm.id + '">✓ Valider</button>' +
        '<button type="button" class="btn danger" data-act="reject" data-id="' + fm.id + '">✕ Rejeter</button>' });
      board =
        column('saisi', 'À valider', by.saisi, { head: by.saisi.length ? selAll('saisi') : '', card: actSaisi, empty: 'Rien à valider 🎉' }) +
        column('rejete', 'Rejetés', by.rejete, { card: (fm) => ({ selectable: true, actions: '<button type="button" class="btn ok" data-act="validate" data-id="' + fm.id + '">✓ Valider finalement</button>' }), empty: 'Aucun rejet' }) +
        column('valide', 'Validés N-1', by.valide, { card: (fm) => ({ selectable: true, showCreator: true, actions: '<button type="button" class="btn sm ghost" data-act="unvalidate" data-id="' + fm.id + '">Annuler la validation</button>' }) }) +
        column('remonte', 'Remontés N+1', by.remonte, { card: () => ({ showCreator: true }), empty: 'Choix du Directeur' });
    } else {
      const canRaise = sel.length && sel.every((r) => r.statut === 'Validé N-1');
      const canUnraise = sel.length && sel.every((r) => r.statut === 'Remonté N+1');
      const weekForArchive = state.filters.semaine;
      toolbar =
        '<span class="sel-count">' + sel.length + ' sélectionné(s)</span>' +
        '<button class="btn accent" data-action="bulk-raise"' + (canRaise ? '' : ' disabled') + '>▲ Remonter au N+1</button>' +
        '<button class="btn" data-action="bulk-unraise"' + (canUnraise ? '' : ' disabled') + '>Retirer de la remontée</button>' +
        (sel.length ? '<button class="btn ghost" data-action="clear-sel">Désélectionner</button>' : '') +
        '<span class="spacer"></span>' +
        '<button class="btn" data-action="goto-synth">Voir la synthèse N+1 →</button>' +
        '<button class="btn ghost" data-action="archive-week"' + (weekForArchive ? '' : ' disabled title="Choisissez une semaine dans les filtres"') + '>Archiver la semaine' + (weekForArchive ? ' ' + esc(weekForArchive) : '') + '…</button>';
      board =
        column('valide', 'Validés N-1 · à arbitrer', by.valide, { head: by.valide.length ? selAll('valide') : '', card: (fm) => ({ selectable: true, showCreator: true, actions: '<button type="button" class="btn sm accent" data-act="raise" data-id="' + fm.id + '">▲ Remonter</button>' }), empty: 'Aucun FM validé par les managers' }) +
        column('remonte', 'Remontés N+1', by.remonte, { head: by.remonte.length ? selAll('remonte') : '', card: (fm) => ({ selectable: true, showCreator: true, actions: '<button type="button" class="btn sm ghost" data-act="unraise" data-id="' + fm.id + '">Retirer</button>' }), empty: 'Cochez des FM à gauche puis « Remonter »' }) +
        column('saisi', 'En attente manager', by.saisi.concat(by.rejete), { card: () => ({ showStatus: true }), empty: '—' }) +
        column('archive', 'Archivés', by.archive, { card: () => ({ showStatus: false }), empty: '—' });
    }
    $('#toolbar').innerHTML = toolbar;
    $('#board').innerHTML = board;
  }

  // ===================================================================
  // Modales
  // ===================================================================
  const modal = () => $('#modal');
  function openModal(html, onReady) {
    $('#modalInner').innerHTML = html;
    if (!modal().open) modal().showModal();
    if (onReady) onReady($('#modalInner'));
  }
  function closeModal() { if (modal().open) modal().close(); }

  function timelineHtml(fm) {
    const h = (fm.historique || []).slice().reverse();
    if (!h.length) return '<p class="muted">Aucun historique.</p>';
    const cls = (a) => /Rejet/.test(a) ? 'a-rejete' : /Remont/.test(a) ? 'a-remonte' : /Valid/.test(a) ? 'a-valide' : /Fusion/.test(a) ? 'a-fusion' : '';
    return '<ol class="timeline">' + h.map((e) => '<li class="' + cls(e.action) + '"><div class="t-head"><strong>' + esc(e.action) + '</strong> · ' + esc(e.auteur) +
      '</div><div class="t-date">' + fmtDate(e.date) + '</div>' + (e.commentaire ? '<div class="t-com">' + esc(e.commentaire) + '</div>' : '') + '</li>').join('') + '</ol>';
  }

  function openDetail(id) {
    const fm = state.rows.find((r) => r.id === id);
    if (!fm) return;
    const st = stage(fm);
    const links = linksOf(fm);
    const role = state.role;
    let actions = '';
    if (role === 'collab' && fm.statut === 'Saisi' && norm(fm.auteur) === norm(me())) actions += '<button type="button" class="btn" data-act="edit" data-id="' + id + '">Modifier</button>';
    if (role === 'manager') {
      if (fm.statut === 'Saisi' || fm.statut === 'Validé N-1') actions += '<button type="button" class="btn" data-act="edit-modal" data-id="' + id + '">Modifier</button>';
      if (fm.statut === 'Saisi') actions += '<button type="button" class="btn danger" data-act="reject" data-id="' + id + '">✕ Rejeter</button><button type="button" class="btn ok" data-act="validate" data-id="' + id + '">✓ Valider</button>';
    }
    if (role === 'directeur') {
      if (fm.statut === 'Validé N-1') actions += '<button type="button" class="btn accent" data-act="raise" data-id="' + id + '">▲ Remonter au N+1</button>';
      if (fm.statut === 'Remonté N+1') actions += '<button type="button" class="btn" data-act="unraise" data-id="' + id + '">Retirer de la remontée</button>';
    }
    actions += '<button type="button" class="btn" data-act="comment" data-id="' + id + '">Ajouter un commentaire</button>';
    openModal(
      '<div class="modal-head"><div><div class="chips"><span class="chip st-' + st + '">' + STAGE_LABEL[st] + '</span>' +
        (fm.priorite !== 'Normal' ? '<span class="chip ' + esc(fm.priorite) + '">' + esc(fm.priorite) + '</span>' : '') + '</div>' +
        '<h2 style="margin-top:6px">' + esc(fm.titre) + ' <span class="card-id">#' + fm.id + '</span></h2></div>' +
        '<button class="close-x" value="close" aria-label="Fermer">×</button></div>' +
      '<div class="detail-grid">' +
        kv('Semaine', fm.semaine) + kv('Zone', fm.zone) + kv('Catégorie', fm.categorie) + kv('Statut', fm.statut) +
        kv('Auteur', fm.auteur) + kv('Saisi le', fmtDate(fm.date_saisie)) + kv('Priorité', fm.priorite) + kv('Pièces jointes', String(links.length)) +
      '</div>' +
      '<div class="desc-block">' + (fm.description ? esc(fm.description) : '<span class="muted">Pas de description.</span>') + '</div>' +
      (links.length ? '<div class="links">' + links.map((l) => /^https?:\/\//i.test(l) ? '<a href="' + esc(l) + '" target="_blank" rel="noopener">' + esc(l) + '</a>' : '<span>' + esc(l) + '</span>').join('') + '</div>' : '') +
      '<h3>Historique</h3>' + timelineHtml(fm) +
      '<div class="modal-foot">' + actions + '</div>'
    );
  }
  function kv(k, v) { return '<div class="kv"><div class="k">' + esc(k) + '</div><div class="v">' + esc(v) + '</div></div>'; }

  function openCommentModal(ids, kind) {
    const isReject = kind === 'reject';
    const n = ids.length;
    openModal(
      '<div class="modal-head"><h2>' + (isReject ? 'Rejeter ' + (n > 1 ? n + ' faits marquants' : 'le fait marquant #' + ids[0]) : 'Commentaire sur #' + ids[0]) + '</h2>' +
        '<button class="close-x" value="close" aria-label="Fermer">×</button></div>' +
      (isReject ? '<p class="muted small">Le FM reste visible par son auteur mais est exclu de la remontée. Une modification par l\'auteur le renvoie en validation.</p>' : '') +
      '<label>' + (isReject ? 'Motif du rejet (obligatoire)' : 'Commentaire') + '<textarea id="cmtText" rows="4" required></textarea></label>' +
      '<div class="modal-foot"><button class="btn ghost" value="close">Annuler</button>' +
        '<button type="button" class="btn ' + (isReject ? 'danger solid' : 'primary') + '" data-confirm-comment>' + (isReject ? 'Rejeter' : 'Ajouter') + '</button></div>',
      (root) => {
        $('#cmtText', root).focus();
        $('[data-confirm-comment]', root).onclick = async () => {
          const txt = $('#cmtText', root).value.trim();
          if (!txt) { toast('Le commentaire est obligatoire.', true); return; }
          closeModal();
          if (isReject) await bulk(ids, (fm) => changeStatus(fm, null, 'Rejeté', txt), '{n} FM rejeté(s).');
          else await bulk(ids, (fm) => changeStatus(fm, null, 'Commentaire', txt), 'Commentaire ajouté.');
        };
      });
  }

  function openEditModal(fm) {
    const opt = (vals, cur) => vals.map((v) => '<option' + (v === cur ? ' selected' : '') + '>' + esc(v) + '</option>').join('');
    openModal(
      '<div class="modal-head"><h2>Modifier #' + fm.id + '</h2><button class="close-x" value="close" aria-label="Fermer">×</button></div>' +
      '<div class="form-grid">' +
        '<label>Semaine<input id="e_semaine" value="' + esc(fm.semaine) + '" pattern="\\d{4}-W\\d{2}"></label>' +
        '<label>Zone<select id="e_zone">' + opt(ZONES, fm.zone) + '</select></label>' +
        '<label>Catégorie<select id="e_categorie">' + opt(CATEGORIES, fm.categorie) + '</select></label>' +
      '</div>' +
      '<label>Priorité<select id="e_priorite">' + opt(PRIORITES, fm.priorite) + '</select></label>' +
      '<label>Titre<input id="e_titre" maxlength="120" value="' + esc(fm.titre) + '"></label>' +
      '<label>Description<textarea id="e_description" rows="5">' + esc(fm.description || '') + '</textarea></label>' +
      '<label>Pièces jointes (un lien par ligne)<textarea id="e_pj" rows="2">' + esc(linksOf(fm).join('\n')) + '</textarea></label>' +
      '<div class="modal-foot"><button class="btn ghost" value="close">Annuler</button><button type="button" class="btn primary" data-save-edit>Enregistrer</button></div>',
      (root) => {
        $('[data-save-edit]', root).onclick = async () => {
          const data = {
            semaine: $('#e_semaine', root).value.trim(), zone: $('#e_zone', root).value, categorie: $('#e_categorie', root).value,
            priorite: $('#e_priorite', root).value, titre: $('#e_titre', root).value.trim(), description: $('#e_description', root).value.trim(),
            pieces_jointes: $('#e_pj', root).value.split(/\r?\n/).map((s) => s.trim()).filter(Boolean),
          };
          if (!/^\d{4}-W\d{2}$/.test(data.semaine) || !data.titre) { toast('Semaine (AAAA-Www) et titre obligatoires.', true); return; }
          const changes = describeChanges(fm, data);
          if (!changes) { closeModal(); return; }
          data.historique = (fm.historique || []).concat([hist('Modifié', changes)]);
          try { await save(fm.id, data); closeModal(); toast('FM #' + fm.id + ' modifié.'); render(); } catch (e) { toast(e.message, true); }
        };
      });
  }

  function openManagerAdd() {
    const f = $('#fmForm');
    resetForm();
    // On réutilise le formulaire collaborateur dans une modale.
    openModal('<div class="modal-head"><h2>Ajouter mon fait marquant</h2><button class="close-x" value="close" aria-label="Fermer">×</button></div><div id="formSlot"></div>', (root) => {
      const slot = $('#formSlot', root);
      slot.appendChild(f);
      if (state.perimetre) f.zone.value = state.perimetre;
      f.titre.focus();
    });
    modal().addEventListener('close', function back() {
      modal().removeEventListener('close', back);
      $('.collab-grid .panel').appendChild(f);
      resetForm();
    });
  }

  function openMerge() {
    const [a, b] = Array.from(state.selected).map((id) => state.rows.find((r) => r.id === id)).sort((x, y) => x.id - y.id);
    if (!a || !b) return;
    const prio = PRIO_RANK[a.priorite] <= PRIO_RANK[b.priorite] ? a.priorite : b.priorite;
    const zone = a.zone === b.zone ? a.zone : 'TRANSVERSE';
    const opt = (vals, cur) => vals.map((v) => '<option' + (v === cur ? ' selected' : '') + '>' + esc(v) + '</option>').join('');
    const desc = (a.description || '') + '\n\n— Fusionné avec #' + b.id + ' (' + b.auteur + ') —\n' + (b.titre) + (b.description ? '\n' + b.description : '');
    openModal(
      '<div class="modal-head"><h2>Fusionner #' + a.id + ' et #' + b.id + '</h2><button class="close-x" value="close" aria-label="Fermer">×</button></div>' +
      '<div class="merge-src">' + cardHtml(a, { showStatus: true }) + cardHtml(b, { showStatus: true }) + '</div>' +
      '<p class="muted small">Un nouveau FM est créé avec l\'historique complet des deux FM d\'origine. Les deux FM d\'origine passent en « Archivé » avec un lien vers le FM fusionné.</p>' +
      '<div class="form-grid">' +
        '<label>Zone<select id="m_zone">' + opt(ZONES, zone) + '</select></label>' +
        '<label>Catégorie<select id="m_categorie">' + opt(CATEGORIES, a.categorie) + '</select></label>' +
        '<label>Priorité<select id="m_priorite">' + opt(PRIORITES, prio) + '</select></label>' +
      '</div>' +
      '<label>Titre<input id="m_titre" maxlength="120" value="' + esc(a.titre) + '"></label>' +
      '<label>Description<textarea id="m_description" rows="7">' + esc(desc) + '</textarea></label>' +
      '<div class="modal-foot"><button class="btn ghost" value="close">Annuler</button><button type="button" class="btn primary" data-do-merge>Fusionner</button></div>',
      (root) => {
        $('[data-do-merge]', root).onclick = async (ev) => {
          ev.target.disabled = true;
          const tag = (fm) => (fm.historique || []).map((h) => Object.assign({}, h, { commentaire: '(issu de #' + fm.id + ')' + (h.commentaire ? ' ' + h.commentaire : '') }));
          const history = tag(a).concat(tag(b)).sort((x, y) => String(x.date).localeCompare(String(y.date)));
          const statut = a.statut === 'Validé N-1' && b.statut === 'Validé N-1' ? 'Validé N-1' : 'Saisi';
          const merged = {
            semaine: a.semaine > b.semaine ? a.semaine : b.semaine,
            auteur: a.auteur === b.auteur ? a.auteur : a.auteur + ' / ' + b.auteur,
            zone: $('#m_zone', root).value, categorie: $('#m_categorie', root).value, priorite: $('#m_priorite', root).value,
            titre: $('#m_titre', root).value.trim() || a.titre, description: $('#m_description', root).value.trim(),
            statut,
            pieces_jointes: Array.from(new Set(linksOf(a).concat(linksOf(b)))),
            historique: history.concat([hist('Fusion', 'Fusion de #' + a.id + ' « ' + a.titre + ' » et #' + b.id + ' « ' + b.titre + ' »')]),
          };
          try {
            const [row] = await FMStore.insert(merged);
            state.rows.unshift(row);
            for (const src of [a, b]) await changeStatus(src, 'Archivé', 'Fusionné', 'Fusionné dans #' + row.id + ' « ' + row.titre + ' »');
            state.selected.clear();
            closeModal();
            toast('FM fusionnés dans #' + row.id + '.');
            render();
          } catch (e) { ev.target.disabled = false; toast(e.message, true); }
        };
      });
  }

  function confirmModal(title, text, okLabel, danger, onOk) {
    openModal('<div class="modal-head"><h2>' + esc(title) + '</h2><button class="close-x" value="close" aria-label="Fermer">×</button></div>' +
      '<p>' + text + '</p><div class="modal-foot"><button class="btn ghost" value="close">Annuler</button>' +
      '<button type="button" class="btn ' + (danger ? 'danger solid' : 'primary') + '" data-ok>' + esc(okLabel) + '</button></div>',
      (root) => { $('[data-ok]', root).onclick = async () => { closeModal(); await onOk(); }; });
  }

  // ===================================================================
  // Synthèse N+1
  // ===================================================================
  function synthRows(week) {
    return state.rows.filter((r) => wasRaised(r) && (!week || r.semaine === week));
  }
  function renderSynthesis() {
    const weeks = Array.from(new Set(state.rows.filter(wasRaised).map((r) => r.semaine))).sort().reverse();
    if (!state.synthWeek || !weeks.includes(state.synthWeek)) state.synthWeek = weeks[0] || CURRENT_WEEK;
    fillSelect($('#synthWeek'), (weeks.length ? weeks : [CURRENT_WEEK]).map((w) => ({ value: w, label: weekLabel(w) })), state.synthWeek);
    $('#synthesis').innerHTML = synthesisHtml(state.synthWeek);
  }
  function synthesisHtml(week) {
    const rows = synthRows(week).sort(sortFm);
    const head = '<h1>Faits marquants – Exploitation &amp; Maintenance</h1><div class="muted">Semaine ' + esc(weekLabel(week)) + ' · édité le ' +
      new Date().toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' }) + '</div>';
    if (!rows.length) return head + '<p class="empty">Aucun fait marquant remonté pour cette semaine. Le Directeur sélectionne les FM dans la vue « Directeur N ».</p>';
    const crit = rows.filter((r) => r.priorite === 'Critique').length;
    const imp = rows.filter((r) => r.priorite === 'Important').length;
    const zones = new Set(rows.map((r) => r.zone)).size;
    let html = head + '<div class="synth-kpis">' + kv('Faits marquants', rows.length) + kv('Critiques', crit) + kv('Importants', imp) + kv('Zones concernées', zones) + '</div>';
    CATEGORIES.forEach((cat) => {
      const items = rows.filter((r) => r.categorie === cat);
      if (!items.length) return;
      html += '<section class="synth-cat"><h2>' + esc(cat) + ' (' + items.length + ')</h2>' + items.map((r) =>
        '<div class="synth-item"><div class="si-title">' + (r.priorite !== 'Normal' ? '<span class="chip ' + esc(r.priorite) + '">' + esc(r.priorite) + '</span> ' : '') +
        '[' + esc(r.zone) + '] ' + esc(r.titre) + '</div>' +
        (r.description ? '<div class="si-desc">' + esc(r.description) + '</div>' : '') +
        '<div class="si-meta">Source : ' + esc(r.auteur) + (linksOf(r).length ? ' · ' + linksOf(r).map((l) => /^https?:/i.test(l) ? '<a href="' + esc(l) + '">' + esc(l) + '</a>' : esc(l)).join(' · ') : '') + '</div></div>').join('') +
      '</section>';
    });
    return html;
  }
  function synthesisStandalone(week) {
    // Version autonome avec styles en ligne (mail / fichier).
    const rows = synthRows(week).sort(sortFm);
    const color = { Critique: '#b42318', Important: '#b26a00' };
    let h = '<div style="font-family:Segoe UI,Arial,sans-serif;color:#17222f;max-width:900px">' +
      '<h1 style="color:#0b2b4c;font-size:20px;margin:0">Faits marquants – Exploitation &amp; Maintenance</h1>' +
      '<p style="color:#5d6b7b;margin:4px 0 12px">Semaine ' + esc(weekLabel(week)) + ' · ' + rows.length + ' fait(s) marquant(s)</p>';
    CATEGORIES.forEach((cat) => {
      const items = rows.filter((r) => r.categorie === cat);
      if (!items.length) return;
      h += '<h2 style="font-size:14px;text-transform:uppercase;color:#0b2b4c;border-bottom:2px solid #0b2b4c;padding-bottom:3px;margin:18px 0 6px">' + esc(cat) + '</h2><ul style="margin:0;padding-left:18px">';
      items.forEach((r) => {
        h += '<li style="margin:0 0 8px"><strong>' + (r.priorite !== 'Normal' ? '<span style="color:' + color[r.priorite] + '">[' + esc(r.priorite).toUpperCase() + ']</span> ' : '') +
          '[' + esc(r.zone) + '] ' + esc(r.titre) + '</strong>' + (r.description ? '<br><span style="white-space:pre-wrap">' + esc(r.description) + '</span>' : '') +
          '<br><span style="color:#5d6b7b;font-size:12px">Source : ' + esc(r.auteur) + '</span></li>';
      });
      h += '</ul>';
    });
    return h + '</div>';
  }
  function synthesisText(week) {
    const rows = synthRows(week).sort(sortFm);
    let t = 'FAITS MARQUANTS – EXPLOITATION & MAINTENANCE\nSemaine ' + weekLabel(week) + '\n';
    CATEGORIES.forEach((cat) => {
      const items = rows.filter((r) => r.categorie === cat);
      if (!items.length) return;
      t += '\n' + cat.toUpperCase() + '\n';
      items.forEach((r) => { t += '- ' + (r.priorite !== 'Normal' ? '[' + r.priorite.toUpperCase() + '] ' : '') + '[' + r.zone + '] ' + r.titre + (r.description ? '\n  ' + r.description.replace(/\n/g, '\n  ') : '') + '\n'; });
    });
    return t;
  }
  async function copySynthesis() {
    const w = state.synthWeek;
    if (!synthRows(w).length) { toast('Rien à copier pour cette semaine.', true); return; }
    try {
      if (window.ClipboardItem && navigator.clipboard && navigator.clipboard.write) {
        await navigator.clipboard.write([new ClipboardItem({
          'text/html': new Blob([synthesisStandalone(w)], { type: 'text/html' }),
          'text/plain': new Blob([synthesisText(w)], { type: 'text/plain' }),
        })]);
      } else {
        await navigator.clipboard.writeText(synthesisText(w));
      }
      toast('Synthèse copiée : collez-la directement dans Outlook ou Teams.');
    } catch (e) {
      toast('Copie impossible dans ce navigateur. Utilisez « Télécharger (HTML) ».', true);
    }
  }

  // ===================================================================
  // Données de test
  // ===================================================================
  function seedData() {
    const people = [
      ['Camille Martin – Maintenance Sud-Ouest', 'SUD-OUEST'], ['Hugo Bernard – Exploitation Sud-Ouest', 'SUD-OUEST'],
      ['Léa Petit – Maintenance Sud-Est', 'SUD-EST'], ['Karim Haddad – Exploitation Sud-Est', 'SUD-EST'],
      ['Sophie Leroy – Exploitation Centre-Ouest', 'CENTRE-OUEST'], ['Thomas Moreau – Maintenance Nord', 'NORD'],
      ['Nadia Fontaine – Exploitation Nord', 'NORD'], ['Jean-Marc Célestin – Exploitation Caraïbes', 'CARAÏBES'],
      ['Priya Payet – Maintenance Réunion', 'RÉUNION'], ['Lucas Wamytan – Exploitation Nouvelle-Calédonie', 'NOUV.CAL.'],
      ['Élodie Garnier – O3C', 'O3C'], ['Marc Dubois – PEO', 'PEO'], ['Anne Roussel – Pôle transverse', 'TRANSVERSE'],
    ];
    const managers = { 'SUD-OUEST': 'Paul Lambert – Manager Sud-Ouest', 'SUD-EST': 'Claire Vidal – Manager Sud-Est', 'CENTRE-OUEST': 'Éric Morel – Manager Centre-Ouest', 'NORD': 'Isabelle Faure – Manager Nord', 'CARAÏBES': 'Didier Joseph – Manager Caraïbes', 'RÉUNION': 'Sandrine Hoarau – Manager Réunion', 'NOUV.CAL.': 'Patrick Néaoutyine – Manager Nouv.Cal.', 'O3C': 'Romain Blanc – Manager O3C', 'PEO': 'Julie Perrin – Manager PEO', 'TRANSVERSE': 'Olivier Mercier – Manager Transverse' };
    const dir = DEFAULT_IDENTITY.directeur;
    const facts = [
      ['HSE', 'Presque-accident lors d\'une consignation HTA', 'Écart détecté par le chargé de consignation avant intervention. Causerie sécurité organisée, rappel de la procédure à toutes les équipes.', 'Important'],
      ['HSE', 'Accident de travail sans arrêt – entorse sur chantier', 'Chute de plain-pied sur un terrain détrempé. Analyse arbre des causes planifiée mardi.', 'Critique'],
      ['HSE', '100 jours sans accident avec arrêt', 'Cap franchi par l\'équipe maintenance. Communication interne prévue.', 'Normal'],
      ['RH', 'Arrivée de deux techniciens de maintenance', 'Intégration en cours, parcours de formation habilitations électriques planifié.', 'Normal'],
      ['RH', 'Tension sur l\'astreinte suite à deux arrêts maladie', 'Planning d\'astreinte couvert par renfort de la zone voisine jusqu\'à fin du mois.', 'Important'],
      ['Réglementaire', 'Visite de l\'inspection (DREAL) sans écart majeur', 'Deux remarques mineures sur la traçabilité des contrôles périodiques. Plan d\'action sous 30 jours.', 'Important'],
      ['Réglementaire', 'Échéance contrôle réglementaire des appareils de levage', '3 équipements à contrôler avant le 15 du mois prochain. Commande passée.', 'Normal'],
      ['Contractuel / Sous-traitants', 'Retard du sous-traitant sur le lot génie civil', 'Retard de 3 semaines annoncé. Pénalités contractuelles à l\'étude, réunion de cadrage vendredi.', 'Critique'],
      ['Contractuel / Sous-traitants', 'Renouvellement du marché de nettoyage industriel', 'Consultation lancée, 4 candidats. Attribution prévue mi-décembre.', 'Normal'],
      ['Projets Transverses', 'Lancement du projet de maintenance prédictive', 'Kick-off réalisé avec la DSI. Pilote sur 12 équipements tournants.', 'Important'],
      ['Projets Transverses', 'Standardisation des gammes de maintenance', '60 % des gammes migrées dans le nouveau référentiel.', 'Normal'],
      ['Actifs', 'Panne du groupe électrogène de secours', 'Défaut alternateur. Groupe de location installé sous 6 h, réparation prévue sous 10 jours.', 'Critique'],
      ['Actifs', 'Remplacement du transformateur T2 terminé', 'Mise en service jeudi, sans incident. Disponibilité retrouvée à 100 %.', 'Normal'],
      ['Actifs', 'Taux de disponibilité mensuel à 98,7 %', 'Au-dessus de l\'objectif (98 %). Principal contributeur : réduction des arrêts non programmés.', 'Normal'],
      ['Digital & Outils', 'Déploiement de la GMAO mobile', '35 techniciens équipés. Retours positifs, quelques soucis de synchronisation hors réseau.', 'Normal'],
      ['Digital & Outils', 'Incident de synchronisation GMAO', 'Ordres de travail non remontés pendant 24 h. Ticket éditeur ouvert, contournement en place.', 'Important'],
      ['Relations', 'Réunion avec les élus locaux sur les travaux de voirie', 'Bon accueil. Demande d\'information régulière aux riverains.', 'Normal'],
      ['Relations', 'Réclamation client sur une coupure programmée', 'Information préalable jugée insuffisante. Réponse envoyée, process de prévenance revu.', 'Important'],
      ['CODEM', 'Préparation du CODEM de décembre', 'Ordre du jour consolidé, points de décision : budget maintenance 2027 et plan HSE.', 'Normal'],
      ['Divers', 'Visite du site par la direction générale', 'Visite appréciée, focus sur la sécurité et la digitalisation.', 'Normal'],
      ['Divers', 'Épisode cyclonique – préparation des sites', 'Plan cyclone activé en vigilance jaune. Matériel sécurisé, astreinte renforcée.', 'Critique'],
    ];
    const weeks = [0, 1, 2].map((i) => { const d = new Date(); d.setDate(d.getDate() - 7 * i); return isoWeek(d); });
    const out = [];
    let k = 0;
    weeks.forEach((w, wi) => {
      const mon = weekMonday(w);
      const count = wi === 0 ? 20 : 12;
      for (let i = 0; i < count; i++) {
        const f = facts[(k * 5 + wi * 3) % facts.length];
        const p = people[(k * 5 + i) % people.length];
        k++;
        const zone = f[0] === 'Divers' && /cyclon/i.test(f[1]) ? (k % 2 ? 'CARAÏBES' : 'RÉUNION') : p[1];
        const author = f[0] === 'Divers' && /cyclon/i.test(f[1]) ? people.find((x) => x[1] === zone)[0] : p[0];
        const at = (h) => new Date(mon.getTime() + h * 3600000).toISOString();
        const base = 8 + (i % 4) * 24 + (i % 3);
        const historique = [{ date: at(base), auteur: author, action: i % 6 === 5 ? 'Importé' : 'Créé', commentaire: i % 6 === 5 ? 'Import export_copilot.csv' : '' }];
        let statut = 'Saisi';
        const mgr = managers[zone];
        // Semaine en cours : workflow en cours. Semaines passées : clôturées.
        const rej = (c) => historique.push({ date: at(base + 30), auteur: mgr, action: 'Rejeté', commentaire: c });
        const val = () => historique.push({ date: at(base + 26), auteur: mgr, action: 'Validé N-1', commentaire: '' });
        const up = () => historique.push({ date: at(base + 50), auteur: dir, action: 'Remonté N+1', commentaire: '' });
        if (wi === 0) {
          const r = i % 10;
          if (r === 2) rej('Doublon avec un autre FM de la zone, à regrouper.');
          if (r === 3) rej('Pas assez significatif pour une remontée, merci de préciser l\'impact.');
          if (r >= 4) { val(); statut = 'Validé N-1'; }
          if (r >= 8) { up(); statut = 'Remonté N+1'; }
        } else {
          const r = i % 4;
          if (r === 1) rej('Hors périmètre de la remontée hebdomadaire.'); else val();
          if (r >= 2) up();
          historique.push({ date: at(150), auteur: dir, action: 'Archivé', commentaire: 'Clôture de la semaine ' + w });
          statut = 'Archivé';
        }
        out.push({
          semaine: w, auteur: author, zone, categorie: f[0], titre: f[1], description: f[2], priorite: f[3], statut, historique,
          pieces_jointes: i % 5 === 0 ? ['https://intranet.exemple.fr/documents/fm-' + w + '-' + i + '.pdf'] : [],
          date_saisie: at(base),
        });
      }
    });
    // Deux FM proches pour tester la fusion.
    out.push({ semaine: weeks[0], auteur: 'Hugo Bernard – Exploitation Sud-Ouest', zone: 'SUD-OUEST', categorie: 'Actifs', titre: 'Déclenchement poste source de Mérignac', description: 'Déclenchement à 6 h 40, réalimentation en 45 min.', priorite: 'Important', statut: 'Saisi', historique: [{ date: new Date(Date.now() - 7200000).toISOString(), auteur: 'Hugo Bernard – Exploitation Sud-Ouest', action: 'Créé', commentaire: '' }], pieces_jointes: [], date_saisie: new Date(Date.now() - 7200000).toISOString() });
    out.push({ semaine: weeks[0], auteur: 'Camille Martin – Maintenance Sud-Ouest', zone: 'SUD-OUEST', categorie: 'Actifs', titre: 'Intervention suite au déclenchement du poste de Mérignac', description: 'Cause identifiée : défaut d\'isolement sur câble HTA. Réparation définitive planifiée.', priorite: 'Normal', statut: 'Saisi', historique: [{ date: new Date(Date.now() - 3600000).toISOString(), auteur: 'Camille Martin – Maintenance Sud-Ouest', action: 'Créé', commentaire: '' }], pieces_jointes: [], date_saisie: new Date(Date.now() - 3600000).toISOString() });
    return out;
  }

  async function doSeed() {
    try {
      const rows = seedData();
      const inserted = await FMStore.insert(rows);
      state.rows = inserted.concat(state.rows);
      state.lastError = null;
      toast(inserted.length + ' faits marquants de test créés sur 3 semaines.');
      render();
    } catch (e) { toast(e.message, true); state.lastError = e.message; renderConn(); }
  }

  // ===================================================================
  // Événements
  // ===================================================================
  function bind() {
    $$('.roles button').forEach((b) => b.addEventListener('click', () => {
      state.role = b.dataset.role;
      lsSet('fm_role', state.role);
      state.selected.clear();
      if (state.role === 'directeur' && !state.filters.semaine) state.filters.semaine = '';
      closeModal();
      render();
    }));

    $('#identity').addEventListener('change', (e) => {
      state.identities[state.role] = e.target.value.trim();
      lsSet('fm_identities', JSON.stringify(state.identities));
      render();
    });

    const menuBtn = $('#menuBtn'), menuList = $('#menuList');
    menuBtn.addEventListener('click', (e) => { e.stopPropagation(); menuList.hidden = !menuList.hidden; menuBtn.setAttribute('aria-expanded', String(!menuList.hidden)); });
    document.addEventListener('click', () => { menuList.hidden = true; menuBtn.setAttribute('aria-expanded', 'false'); });

    // Formulaire
    const f = $('#fmForm');
    f.addEventListener('submit', submitForm);
    f.titre.addEventListener('input', updateCount);
    $('#prioSeg').addEventListener('click', (e) => { const b = e.target.closest('button[data-v]'); if (b) setPrio(b.dataset.v); });
    $('#formReset').addEventListener('click', () => { resetForm(); if (modal().open) closeModal(); });
    f.addEventListener('keydown', (e) => { if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) submitForm(e); });
    $('#showAllCollab').addEventListener('change', (e) => { state.showAllCollab = e.target.checked; renderCollab(); });

    // Import
    const drop = $('#drop'), input = $('#importFile');
    input.addEventListener('change', () => { handleImportFile(input.files[0]); input.value = ''; });
    ['dragenter', 'dragover'].forEach((t) => drop.addEventListener(t, (e) => { e.preventDefault(); drop.classList.add('over'); }));
    ['dragleave', 'drop'].forEach((t) => drop.addEventListener(t, (e) => { e.preventDefault(); drop.classList.remove('over'); }));
    drop.addEventListener('drop', (e) => handleImportFile(e.dataTransfer.files[0]));

    // Filtres
    $('#filters').addEventListener('input', (e) => {
      const el = e.target;
      if (el.dataset.filter) { state.filters[el.dataset.filter] = el.value; renderBoard(); }
      if (el.hasAttribute('data-perim')) { state.perimetre = el.value; lsSet('fm_perimetre', el.value); renderBoard(); }
    });
    $('#synthWeek').addEventListener('change', (e) => { state.synthWeek = e.target.value; renderSynthesis(); });

    // Sélection & actions sur les cartes (délégation globale)
    document.addEventListener('change', (e) => {
      const id = e.target.dataset && e.target.dataset.select;
      if (!id) return;
      const n = Number(id);
      if (e.target.checked) state.selected.add(n); else state.selected.delete(n);
      renderBoard();
    });

    document.addEventListener('click', async (e) => {
      const t = e.target;
      if (t.matches('input[type=checkbox][data-select]')) { e.stopPropagation(); return; }
      if (t.closest('#modal [value="close"]')) { e.preventDefault(); closeModal(); return; }

      const actBtn = t.closest('[data-act]');
      if (actBtn) {
        e.preventDefault();
        e.stopPropagation();
        const id = Number(actBtn.dataset.id);
        const fm = state.rows.find((r) => r.id === id);
        if (!fm) return;
        const act = actBtn.dataset.act;
        if (act === 'edit') { closeModal(); editInForm(fm); return; }
        if (act === 'edit-modal') { openEditModal(fm); return; }
        if (act === 'reject') { openCommentModal([id], 'reject'); return; }
        if (act === 'comment') { openCommentModal([id], 'comment'); return; }
        closeModal();
        if (act === 'validate') await bulk([id], (x) => changeStatus(x, 'Validé N-1', 'Validé N-1'), 'FM #' + id + ' validé.');
        if (act === 'unvalidate') await bulk([id], (x) => changeStatus(x, 'Saisi', 'Validation annulée'), 'Validation annulée.');
        if (act === 'raise') await bulk([id], (x) => changeStatus(x, 'Remonté N+1', 'Remonté N+1'), 'FM #' + id + ' remonté au N+1.');
        if (act === 'unraise') await bulk([id], (x) => changeStatus(x, 'Validé N-1', 'Retiré de la remontée'), 'FM #' + id + ' retiré de la remontée.');
        return;
      }

      const selAll = t.closest('[data-selall]');
      if (selAll) {
        const col = selAll.dataset.selall;
        const ids = $$('.col[data-col="' + col + '"] [data-select]').map((c) => Number(c.dataset.select));
        const allOn = ids.every((i) => state.selected.has(i));
        ids.forEach((i) => (allOn ? state.selected.delete(i) : state.selected.add(i)));
        renderBoard();
        return;
      }

      const action = t.closest('[data-action]');
      if (action) {
        const a = action.dataset.action;
        const sel = Array.from(state.selected);
        switch (a) {
          case 'refresh': await load(); break;
          case 'seed': await doSeed(); break;
          case 'toggle-mode':
            FMStore.setMode(FMStore.mode === 'local' ? 'supabase' : 'local');
            state.lastError = null;
            toast(FMStore.mode === 'local' ? 'Mode local activé (données dans ce navigateur).' : 'Connexion à Supabase…');
            await load();
            break;
          case 'wipe':
            confirmModal('Vider toutes les données ?', 'Tous les faits marquants de la source actuelle (<strong>' + (FMStore.mode === 'local' ? 'navigateur' : 'Supabase') + '</strong>) seront définitivement supprimés.', 'Tout supprimer', true, async () => {
              try { await FMStore.removeAll(); state.rows = []; state.selected.clear(); toast('Données supprimées.'); render(); } catch (err) { toast(err.message, true); }
            });
            break;
          case 'tpl-csv': downloadTemplate('csv'); break;
          case 'tpl-json': downloadTemplate('json'); break;
          case 'copy-prompt':
            try { await navigator.clipboard.writeText(copilotPrompt()); toast('Consigne copiée : collez-la dans Copilot.'); }
            catch (err) { openModal('<div class="modal-head"><h2>Consigne pour Copilot</h2><button class="close-x" value="close">×</button></div><textarea rows="16" readonly>' + esc(copilotPrompt()) + '</textarea>'); }
            break;
          case 'import-cancel': state.importRows = null; renderImportPreview(); break;
          case 'import-go': await doImport(); break;
          case 'bulk-validate': await bulk(sel, (x) => changeStatus(x, 'Validé N-1', 'Validé N-1'), '{n} FM validé(s).'); break;
          case 'bulk-reject': openCommentModal(sel, 'reject'); break;
          case 'merge': openMerge(); break;
          case 'clear-sel': state.selected.clear(); renderBoard(); break;
          case 'manager-add': openManagerAdd(); break;
          case 'bulk-raise': await bulk(sel, (x) => changeStatus(x, 'Remonté N+1', 'Remonté N+1'), '{n} FM remonté(s) au N+1.'); break;
          case 'bulk-unraise': await bulk(sel, (x) => changeStatus(x, 'Validé N-1', 'Retiré de la remontée'), '{n} FM retiré(s) de la remontée.'); break;
          case 'goto-synth':
            state.role = 'lecteur'; lsSet('fm_role', 'lecteur');
            if (state.filters.semaine) state.synthWeek = state.filters.semaine;
            render(); break;
          case 'archive-week': {
            const w = state.filters.semaine;
            const ids = state.rows.filter((r) => r.semaine === w && r.statut !== 'Archivé').map((r) => r.id);
            if (!ids.length) { toast('Rien à archiver pour ' + w + '.'); break; }
            confirmModal('Archiver la semaine ' + w + ' ?', ids.length + ' fait(s) marquant(s) passeront au statut « Archivé ». Ceux qui ont été remontés restent visibles dans la synthèse N+1.', 'Archiver', false, () =>
              bulk(ids, (x) => changeStatus(x, 'Archivé', 'Archivé', 'Clôture de la semaine ' + w), '{n} FM archivé(s).'));
            break;
          }
          case 'synth-copy': await copySynthesis(); break;
          case 'synth-html':
            download('synthese_FM_' + state.synthWeek + '.html', '<!doctype html><html lang="fr"><head><meta charset="utf-8"><title>Synthèse FM ' + esc(state.synthWeek) + '</title></head><body>' + synthesisStandalone(state.synthWeek) + '</body></html>', 'text/html;charset=utf-8');
            break;
          case 'synth-csv': {
            const cols = ['id', 'semaine', 'categorie', 'zone', 'priorite', 'titre', 'description', 'auteur', 'statut'];
            const rows = synthRows(state.synthWeek).sort((x, y) => CATEGORIES.indexOf(x.categorie) - CATEGORIES.indexOf(y.categorie) || sortFm(x, y));
            download('synthese_FM_' + state.synthWeek + '.csv', '﻿' + [cols.join(';')].concat(rows.map((r) => cols.map((c) => csvEscape(r[c])).join(';'))).join('\r\n'), 'text/csv;charset=utf-8');
            break;
          }
          case 'synth-print': window.print(); break;
        }
        return;
      }

      // Clic sur une carte : ouvre le détail (historique compris)
      const card = t.closest('.card[data-id]');
      if (card && !t.closest('.merge-src') && !t.closest('a')) openDetail(Number(card.dataset.id));
    });

    document.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && e.target.matches && e.target.matches('.card[data-id]')) openDetail(Number(e.target.dataset.id));
    });

    // Rafraîchissement automatique (multi-utilisateurs) toutes les 30 s
    setInterval(() => {
      if (document.visibilityState === 'visible' && FMStore.mode === 'supabase' && !modal().open && !state.lastError) load(true);
    }, 30000);
  }

  // ===================================================================
  // Démarrage
  // ===================================================================
  setupForm();
  bind();
  render();
  load();
})();
