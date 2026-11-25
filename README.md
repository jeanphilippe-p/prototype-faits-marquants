# Faits Marquants – prototype

Outil web de remontée des faits marquants hebdomadaires, avec un workflow en entonnoir :
**Collaborateur → Manager N-1 → Directeur N → Lecteur N+1**.

HTML / CSS / JavaScript sans framework, données dans Supabase (SDK JS via CDN), hébergeable sur GitHub Pages.

## Mise en route (5 minutes)

1. **Créer la table dans Supabase** : ouvrir le projet Supabase → *SQL Editor* → *New query*, coller le contenu de
   [`supabase/setup.sql`](supabase/setup.sql) et cliquer sur *Run*.
   Le script crée la table `faits_marquants` et ouvre l'accès en lecture/écriture à la clé publique.
   ⚠️ Ces règles sont faites pour un prototype : toute personne qui a l'adresse du site peut modifier les données.
2. **Publier sur GitHub Pages** : *Settings → Pages → Build and deployment → Deploy from a branch*, branche `main`, dossier `/ (root)`.
3. Ouvrir le site, puis menu **⋯ → Générer des données de test** pour remplir 3 semaines de faits marquants sur toutes les zones.

Pour tester sans Supabase : menu **⋯ → Basculer Supabase / local** (données conservées dans le navigateur uniquement).

## Les 4 vues

| Vue | Ce qu'on y fait |
|---|---|
| Collaborateur | Saisir un FM (Ctrl + Entrée pour enregistrer), modifier ses FM tant qu'ils sont au statut « Saisi », importer un fichier CSV/JSON exporté depuis Copilot (modèles téléchargeables + consigne à copier dans Copilot). |
| Manager N-1 | Kanban *À valider / Rejetés / Validés N-1 / Remontés N+1*, filtres semaine / zone / catégorie / priorité, validation en un clic ou en lot (« Tout cocher » puis « Valider la sélection »), rejet avec motif obligatoire, fusion de 2 FM, ajout de ses propres FM. |
| Directeur N | FM validés par les managers, à cocher puis « Remonter au N+1 » ; retrait possible ; archivage d'une semaine. |
| Synthèse N+1 | FM remontés pour une semaine, classés par catégorie puis priorité ; copie prête à coller dans un mail, export HTML, CSV, impression / PDF. |

Cliquer sur une carte ouvre le détail et l'**historique complet** (création, import, modifications, validation, rejet, fusion, remontée, archivage, commentaires). La dernière action est aussi affichée sur chaque carte.

## Choix faits pour le prototype

- **Pas d'authentification** : le champ « Je suis » en haut de page donne le nom utilisé dans l'historique (un nom mémorisé par vue).
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
js/store.js           accès aux données (Supabase ou navigateur)
js/app.js             vues, workflow, import, fusion, synthèse, données de test
supabase/setup.sql    création de la table et règles d'accès du prototype
modeles/              modèle d'import CSV
```
