// Configuration Supabase du prototype.
// La clé "publishable" (anon) est faite pour être publique : la sécurité
// repose sur les règles RLS définies dans supabase/setup.sql.
window.FM_CONFIG = {
  SUPABASE_URL: 'https://bdgtfvbzadxcaoazodbs.supabase.co', // sans /rest/v1/
  SUPABASE_KEY: 'sb_publishable_09ncY00wOAzQxGMOdm77Dw_Cbct249f',
  TABLE: 'faits_marquants',
};
