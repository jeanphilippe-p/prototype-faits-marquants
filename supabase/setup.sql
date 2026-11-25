-- =====================================================================
-- Faits Marquants : création de la table + règles d'accès du PROTOTYPE
-- À exécuter une seule fois dans Supabase > SQL Editor > New query > Run
-- Le script peut être relancé sans risque (il ne supprime aucune donnée).
-- =====================================================================

create table if not exists public.faits_marquants (
  id             bigint generated always as identity primary key,
  semaine        text        not null check (semaine ~ '^\d{4}-W\d{2}$'),      -- ex. 2025-W22
  date_saisie    timestamptz not null default now(),
  auteur         text        not null,                                          -- nom + service
  zone           text        not null check (zone in (
                   'SUD-OUEST','SUD-EST','CENTRE-OUEST','NORD','CARAÏBES',
                   'RÉUNION','NOUV.CAL.','O3C','PEO','TRANSVERSE')),
  categorie      text        not null check (categorie in (
                   'RH','HSE','Réglementaire','Contractuel / Sous-traitants',
                   'Projets Transverses','Actifs','Digital & Outils','Relations',
                   'CODEM','Divers')),
  titre          text        not null check (char_length(titre) <= 120),
  description    text        not null default '',
  priorite       text        not null default 'Normal'
                   check (priorite in ('Normal','Important','Critique')),
  statut         text        not null default 'Saisi'
                   check (statut in ('Saisi','Validé N-1','Remonté N+1','Archivé')),
  historique     jsonb       not null default '[]'::jsonb,                      -- [{date, auteur, action, commentaire}]
  pieces_jointes jsonb       not null default '[]'::jsonb                       -- liste de liens (texte)
);

create index if not exists faits_marquants_semaine_idx on public.faits_marquants (semaine);
create index if not exists faits_marquants_statut_idx  on public.faits_marquants (statut);

-- ---------------------------------------------------------------------
-- Règles d'accès (RLS) : PROTOTYPE UNIQUEMENT
-- Sans authentification, la clé publique (anon / publishable) doit pouvoir
-- lire et écrire. Toute personne qui a l'URL du site peut donc modifier
-- les données. À remplacer par des règles basées sur l'utilisateur
-- connecté avant tout usage réel.
-- ---------------------------------------------------------------------
alter table public.faits_marquants enable row level security;

drop policy if exists "prototype_lecture"     on public.faits_marquants;
drop policy if exists "prototype_creation"    on public.faits_marquants;
drop policy if exists "prototype_modification" on public.faits_marquants;
drop policy if exists "prototype_suppression" on public.faits_marquants;

create policy "prototype_lecture"      on public.faits_marquants for select to anon, authenticated using (true);
create policy "prototype_creation"     on public.faits_marquants for insert to anon, authenticated with check (true);
create policy "prototype_modification" on public.faits_marquants for update to anon, authenticated using (true) with check (true);
create policy "prototype_suppression"  on public.faits_marquants for delete to anon, authenticated using (true);

grant select, insert, update, delete on public.faits_marquants to anon, authenticated;
