# Faits Marquants – prototype

Outil web de remontée des faits marquants hebdomadaires, avec un workflow en entonnoir :
**Collaborateur → Manager N-1 → Directeur N → Lecteur N+1**.

HTML / CSS / JavaScript sans framework, données dans Supabase (SDK JS via CDN), hébergeable sur GitHub Pages.

## Mise en route

1. **Installer la base** : ouvrir le projet Supabase → *SQL Editor* → *New query*, coller le contenu de
   [`supabase/setup.sql`](supabase/setup.sql), **remplacer `prenom.nom@exemple.fr` (tout en bas) par l'adresse du premier administrateur**, puis cliquer sur *Run*.
   Le script peut être relancé sans perte de données ; il remplace les règles ouvertes de la première version.
2. **Régler l'authentification Supabase** (*Authentication*) :
   - *Sign In / Providers → Email* : activé, avec **Confirm email** activé (prouve que la personne possède bien l'adresse).
   - *URL Configuration* : **Site URL** = `https://jeanphilippe-p.github.io/prototype-faits-marquants/` (même adresse dans *Redirect URLs*).
     Les liens de confirmation et de mot de passe oublié renvoient vers cette page.
   - Le service d'email intégré à Supabase n'envoie que quelques emails par heure : suffisant pour tester, à remplacer par votre serveur SMTP (*Authentication → Emails → SMTP Settings*) avant un vrai déploiement.
3. **Publier sur GitHub Pages** : *Settings → Pages → Deploy from a branch*, branche `main`, dossier `/ (root)`.
4. Sur le site : **Créer mon compte** avec l'adresse administrateur, confirmer via l'email reçu, se connecter, puis menu **⋯ → Générer des données de test**.

## Sécurité et gestion des accès

- Personne ne voit de données sans être **connecté** (email + mot de passe) **et autorisé**. La page elle-même reste publique mais ne contient aucune donnée ; la clé publique Supabase seule ne donne accès qu'à la demande d'accès.
- **Inscription** : seule une adresse autorisée par un administrateur peut créer un compte (contrôle côté base de données, pas seulement dans la page).
- **Demande d'accès** : depuis l'écran de connexion, une personne non autorisée laisse son nom et son email. La demande apparaît dans l'onglet **Administration** (visible des seuls administrateurs) : *Autoriser* ou *Refuser*. Il faut ensuite prévenir la personne qu'elle peut créer son compte (pas d'email automatique).
- **Administration** : ajout direct d'une adresse, droits administrateur, retrait d'accès. Retirer une adresse coupe l'accès immédiatement, même si le compte existe (le compte peut être supprimé dans *Supabase → Authentication → Users*).
- Seuls les administrateurs peuvent générer des données de test ou vider la base.
- Le choix de la vue (Collaborateur, Manager, Directeur, Synthèse) reste libre pour tout utilisateur autorisé : les rôles métier ne sont pas encore liés au compte.

## Les 4 vues

| Vue | Ce qu'on y fait |
|---|---|
| Collaborateur | Saisir un FM (Ctrl + Entrée pour enregistrer), modifier ses FM tant qu'ils sont au statut « Saisi », importer un fichier CSV/JSON exporté depuis Copilot (modèles téléchargeables + consigne à copier dans Copilot). |
| Manager N-1 | Kanban *À valider / Rejetés / Validés N-1 / Remontés N+1*, filtres semaine / zone / catégorie / priorité, validation en un clic ou en lot (« Tout cocher » puis « Valider la sélection »), rejet avec motif obligatoire, fusion de 2 FM, ajout de ses propres FM. |
| Directeur N | FM validés par les managers, à cocher puis « Remonter au N+1 » ; retrait possible ; archivage d'une semaine. |
| Synthèse N+1 | FM remontés pour une semaine, classés par catégorie puis priorité ; copie prête à coller dans un mail, export HTML, CSV, impression / PDF. |

Cliquer sur une carte ouvre le détail et l'**historique complet** (création, import, modifications, validation, rejet, fusion, remontée, archivage, commentaires). La dernière action est aussi affichée sur chaque carte.

## Choix faits pour le prototype

- **Nom dans l'historique** : le champ « Je suis » affiche le nom – service du compte connecté ; il est modifiable et enregistré sur le compte.
- **Rejet** : le modèle de données n'a que 4 statuts, donc un FM rejeté reste « Saisi » et sa dernière action d'historique est « Rejeté ». Il reste visible pour son auteur mais n'apparaît pas dans les FM à remonter. Si l'auteur le modifie, il repart en validation.
- **Équipe d'un manager** : sans annuaire, une équipe = une zone (liste « Mon équipe (périmètre) »).
- **Fusion** : un nouveau FM est créé avec l'historique des deux FM d'origine ; ceux-ci passent en « Archivé » avec la mention « Fusionné dans #… ».
- **Pièces jointes** : liste de liens (texte).

## Format d'import

CSV (séparateur `;` ou `,`, encodage UTF-8) ou JSON (tableau d'objets) avec les colonnes :
`semaine;auteur;zone;categorie;titre;description;priorite;pieces_jointes`.
Voir [`modeles/modele_faits_marquants.csv`](modeles/modele_faits_marquants.csv). Les valeurs de zone, catégorie et priorité sont reconnues sans tenir compte des majuscules ni des accents ; les lignes en erreur sont signalées avant l'import. Plusieurs liens : séparés par ` | `.

## Structure

```
index.html            page unique
css/style.css         styles
js/config.js          URL et clé publique Supabase
js/store.js           accès aux données et authentification Supabase
js/app.js             connexion, administration, vues, workflow, import, fusion, synthèse
supabase/setup.sql    tables, contrôle des inscriptions et règles d'accès
modeles/              modèle d'import CSV
```
