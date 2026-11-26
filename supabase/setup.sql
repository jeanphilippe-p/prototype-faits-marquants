-- =====================================================================
-- Faits Marquants : installation Supabase (table + authentification)
-- À exécuter dans Supabase > SQL Editor > New query > Run.
-- Le script peut être relancé sans risque : il ne supprime aucune donnée.
--
-- Principe de sécurité :
--   * Seules les adresses email AUTORISÉES par un administrateur peuvent
--     créer un compte (contrôle au moment de l'inscription).
--   * Seuls les utilisateurs connectés ET autorisés peuvent lire ou écrire
--     les faits marquants (règles RLS). La clé publique seule ne donne
--     plus accès à aucune donnée.
--   * Retirer une adresse de la liste coupe l'accès immédiatement.
-- =====================================================================


-- ---------------------------------------------------------------------
-- 1. Table des faits marquants
-- ---------------------------------------------------------------------
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
-- 2. Liste des adresses email (demandes d'accès + accès validés)
-- ---------------------------------------------------------------------
create table if not exists public.acces_utilisateurs (
  email       text primary key check (email = lower(email) and email ~ '^[^@\s]+@[^@\s]+\.[^@\s]+$'),
  nom         text,
  statut      text not null default 'en_attente' check (statut in ('en_attente','autorise','refuse')),
  est_admin   boolean not null default false,
  demande_le  timestamptz not null default now(),
  decide_par  text,
  decide_le   timestamptz
);


-- ---------------------------------------------------------------------
-- 3. Fonctions de contrôle
-- ---------------------------------------------------------------------
create or replace function public.mon_email() returns text
language sql stable
as $$ select lower(coalesce(auth.jwt() ->> 'email', '')) $$;

create or replace function public.est_autorise() returns boolean
language sql stable security definer set search_path = public
as $$ select exists (select 1 from public.acces_utilisateurs
                     where email = public.mon_email() and statut = 'autorise') $$;

create or replace function public.est_admin() returns boolean
language sql stable security definer set search_path = public
as $$ select exists (select 1 from public.acces_utilisateurs
                     where email = public.mon_email() and statut = 'autorise' and est_admin) $$;

-- Demande d'accès depuis l'écran de connexion (sans compte).
-- Ne révèle jamais si l'adresse est déjà connue.
create or replace function public.demander_acces(p_email text, p_nom text) returns void
language plpgsql security definer set search_path = public
as $$
begin
  if p_email is null or lower(trim(p_email)) !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' then
    raise exception 'Adresse email invalide';
  end if;
  insert into public.acces_utilisateurs (email, nom)
  values (lower(trim(p_email)), left(trim(coalesce(p_nom, '')), 120))
  on conflict (email) do nothing;
end $$;

-- Blocage des inscriptions : une adresse non autorisée ne peut pas créer de compte.
create or replace function public.verifier_email_autorise() returns trigger
language plpgsql security definer set search_path = public
as $$
begin
  if not exists (select 1 from public.acces_utilisateurs
                 where email = lower(new.email) and statut = 'autorise') then
    raise exception 'EMAIL_NON_AUTORISE';
  end if;
  return new;
end $$;

drop trigger if exists verifier_email_autorise on auth.users;
create trigger verifier_email_autorise
  before insert on auth.users
  for each row execute function public.verifier_email_autorise();


-- ---------------------------------------------------------------------
-- 4. Règles d'accès (RLS)
-- ---------------------------------------------------------------------
alter table public.faits_marquants    enable row level security;
alter table public.acces_utilisateurs enable row level security;

-- Suppression des règles ouvertes de la première version du prototype
drop policy if exists "prototype_lecture"      on public.faits_marquants;
drop policy if exists "prototype_creation"     on public.faits_marquants;
drop policy if exists "prototype_modification" on public.faits_marquants;
drop policy if exists "prototype_suppression"  on public.faits_marquants;

drop policy if exists "fm_lecture"      on public.faits_marquants;
drop policy if exists "fm_creation"     on public.faits_marquants;
drop policy if exists "fm_modification" on public.faits_marquants;
drop policy if exists "fm_suppression"  on public.faits_marquants;

create policy "fm_lecture"      on public.faits_marquants for select to authenticated using (public.est_autorise());
create policy "fm_creation"     on public.faits_marquants for insert to authenticated with check (public.est_autorise());
create policy "fm_modification" on public.faits_marquants for update to authenticated using (public.est_autorise()) with check (public.est_autorise());
create policy "fm_suppression"  on public.faits_marquants for delete to authenticated using (public.est_admin());

drop policy if exists "acces_lecture"      on public.acces_utilisateurs;
drop policy if exists "acces_admin_ajout"  on public.acces_utilisateurs;
drop policy if exists "acces_admin_modif"  on public.acces_utilisateurs;
drop policy if exists "acces_admin_suppr"  on public.acces_utilisateurs;

create policy "acces_lecture"     on public.acces_utilisateurs for select to authenticated using (email = public.mon_email() or public.est_admin());
create policy "acces_admin_ajout" on public.acces_utilisateurs for insert to authenticated with check (public.est_admin());
create policy "acces_admin_modif" on public.acces_utilisateurs for update to authenticated using (public.est_admin()) with check (public.est_admin());
create policy "acces_admin_suppr" on public.acces_utilisateurs for delete to authenticated using (public.est_admin());

-- La clé publique (anon) n'a plus accès aux tables, seulement à la demande d'accès.
revoke all on public.faits_marquants    from anon;
revoke all on public.acces_utilisateurs from anon;
grant select, insert, update, delete on public.faits_marquants    to authenticated;
grant select, insert, update, delete on public.acces_utilisateurs to authenticated;

revoke execute on function public.demander_acces(text, text) from public;
grant  execute on function public.demander_acces(text, text) to anon, authenticated;
revoke execute on function public.verifier_email_autorise() from public, anon, authenticated;


-- ---------------------------------------------------------------------
-- 5. PREMIER ADMINISTRATEUR
-- Remplacez l'adresse ci-dessous par la vôtre AVANT d'exécuter le script,
-- puis créez votre compte depuis l'écran de connexion du site.
-- ---------------------------------------------------------------------
insert into public.acces_utilisateurs (email, nom, statut, est_admin, decide_par, decide_le)
values (lower('prenom.nom@exemple.fr'), 'Administrateur', 'autorise', true, 'installation', now())
on conflict (email) do update set statut = 'autorise', est_admin = true;
