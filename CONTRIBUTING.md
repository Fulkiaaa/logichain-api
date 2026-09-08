# Contribuer à LogiChain API

Ce document décrit le modèle de branches, les conventions de commit et de
Pull Request, ainsi que la procédure de passation à une future équipe. Il
s'applique à ce dépôt et à ses deux dépôts frères (`LogiChainMobile`,
`logichain-infra`), qui partagent les mêmes règles.

## 1. Modèle de branches (Gitflow simplifié)

```
main        ●───────────────●───────────●───────────►  (production, toujours déployable)
             \               \           \
develop       ●───●───●───●───●───●───●───●─────────►  (intégration continue des features)
               \   \       \
feature/*       ●───●       ●─────────►  (une fonctionnalité, courte durée de vie)

hotfix/*    part de main, revient sur main ET develop (correctif urgent en prod)
```

- **`main`** : reflète toujours l'état livré/livrable. Protégée, historique
  linéaire (voir § 6).
- **`develop`** : branche d'intégration. Toutes les `feature/*` y fusionnent
  avant de partir vers `main`.
- **`feature/*`** : une branche par fonctionnalité ou tâche, créée depuis
  `develop`, fusionnée dans `develop` via Pull Request.
- **`hotfix/*`** : correctif urgent créé depuis `main`, fusionné dans `main`
  **et** reporté dans `develop` (pour ne pas le perdre à la prochaine mise à
  jour de `develop`).

## 2. Convention de nommage des branches

| Préfixe      | Usage                                   | Exemple                          |
|--------------|------------------------------------------|-----------------------------------|
| `feature/`   | Nouvelle fonctionnalité ou tâche          | `feature/gestion-des-alertes`     |
| `fix/`       | Correction de bug (hors urgence prod)     | `fix/pagination-dashboard`        |
| `hotfix/`    | Correctif urgent, part de `main`          | `hotfix/faille-auth`              |
| `chore/`     | Maintenance, outillage, dépendances       | `chore/mise-a-jour-eslint`        |
| `docs/`      | Documentation seule                       | `docs/schema-env`                 |
| `ci/`        | Pipelines CI/CD                           | `ci/ajoute-gitleaks`              |

## 3. Convention de commit — Conventional Commits

Chaque commit suit le format :

```
<type>(<portée optionnelle>): <résumé au présent, en minuscules>
```

Types autorisés (imposés par `commitlint.config.js`) :

| Type       | Usage                                                        |
|------------|---------------------------------------------------------------|
| `feat`     | Nouvelle fonctionnalité                                       |
| `fix`      | Correction de bug                                              |
| `docs`     | Documentation uniquement                                       |
| `style`    | Formatage, sans effet sur le comportement                     |
| `refactor` | Réécriture sans changement de comportement observable         |
| `test`     | Ajout ou correction de tests                                   |
| `chore`    | Maintenance, outillage, dépendances                             |
| `ci`       | Pipelines d'intégration/déploiement continus                   |
| `build`    | Système de build, dépendances de build                         |
| `perf`     | Amélioration de performance                                    |

Exemple : `fix(auth): corrige l'expiration prématurée du refresh token`

Le hook `commit-msg` (Husky, voir `commitlint.config.js`) rejette localement
tout message qui ne respecte pas ce format.

## 4. Cycle de vie d'une Pull Request

1. Créer la branche depuis `develop` (ou depuis `main` pour un `hotfix/*`),
   en respectant la convention de nommage du § 2.
2. Développer, committer par petites étapes conventionnelles.
3. Pousser la branche et ouvrir une Pull Request vers `develop` (ou vers
   `main` **et** `develop` pour un `hotfix/*`).
4. La CI se déclenche automatiquement (voir § 5) — les checks doivent
   passer avant fusion.
5. Fusionner (squash de préférence, pour garder `main`/`develop` lisibles)
   une fois les checks verts. La branche source est supprimée après fusion.

## 5. Vérifications automatiques requises

Les checks suivants doivent être **verts** avant qu'une Pull Request vers
`main` ou `develop` puisse être fusionnée (imposé par les rulesets GitHub
`protection-main` et `protection-develop`) :

- `Qualité et tests` (lint, typecheck, tests + couverture, build)
- `Détection de secrets` (gitleaks)

Le nom de ces checks correspond exactement au nom du job dans
`.github/workflows/ci.yml` — ne pas le renommer sans mettre à jour les
rulesets en conséquence (sinon la PR reste bloquée indéfiniment, en attente
d'un check qui ne se déclenchera jamais).

## 6. Checklist de revue

Avant de fusionner une Pull Request, vérifier que :

- [ ] Les deux checks CI (`Qualité et tests`, `Détection de secrets`) sont verts.
- [ ] Les commits suivent la convention du § 3.
- [ ] Le nom de la branche suit la convention du § 2.
- [ ] La couverture de tests n'a pas régressé (seuils dans `jest.config.js`).
- [ ] Aucun secret, clé, mot de passe ou token n'a été introduit (dépôt public).
- [ ] La documentation (`README.md`, `CONTRIBUTING.md`, commentaires) est à
      jour si le comportement observable a changé.
- [ ] Les threads de revue sont résolus (imposé par le ruleset).

## 7. Fusions en squash/rebase sur `main`

`main` impose un historique linéaire (`required_linear_history`) : les
fusions en *merge commit* classique y sont refusées par GitHub. Utiliser
« Squash and merge » ou « Rebase and merge » lors de la fusion d'une Pull
Request vers `main`. `develop` n'a pas cette contrainte, pour ne pas gêner
les fusions d'intégration entre plusieurs `feature/*`.

## 8. Passation à l'équipe suivante

### Pourquoi `required_approving_review_count` vaut `0` aujourd'hui

Ce projet est mené en solo (un seul contributeur, `@Fulkiaaa`). GitHub
interdit techniquement d'approuver sa propre Pull Request : si le nombre
d'approbations requises avait été fixé à `1`, **aucune Pull Request n'aurait
jamais pu être fusionnée**. Le nombre d'approbations requises a donc été
délibérément mis à `0` dans les rulesets `protection-main` et
`protection-develop`, en attendant l'arrivée d'une équipe.

**C'est un choix documenté et assumé, à défendre en soutenance** : il ne
s'agit pas d'une protection désactivée par oubli, mais d'une adaptation
temporaire et explicite au contexte solo du projet.

### Première action de la passation : exiger une revue

Dès qu'un second contributeur rejoint le projet, **la première action** de
passation est de relever `required_approving_review_count` à `1` sur les
deux rulesets, avec la commande suivante (à exécuter par un propriétaire du
dépôt, `gh` authentifié avec le scope `repo`) :

```bash
REPO="Fulkiaaa/logichain-api"

for RULESET in protection-main protection-develop; do
  ID=$(gh api "repos/$REPO/rulesets" --jq ".[] | select(.name==\"$RULESET\") | .id")
  gh api "repos/$REPO/rulesets/$ID" \
    | jq '(.rules[] | select(.type=="pull_request") | .parameters.required_approving_review_count) = 1
          | {name, target, enforcement, conditions, rules, bypass_actors}' \
    > /tmp/ruleset-$RULESET.json
  gh api -X PUT "repos/$REPO/rulesets/$ID" --input "/tmp/ruleset-$RULESET.json"
done
```

Vérifier ensuite avec `gh api repos/$REPO/rulesets/$ID --jq '.rules[] | select(.type=="pull_request")'`
que `required_approving_review_count` vaut bien `1`.

## 9. Procédure d'urgence — désactiver un ruleset

Contrairement à l'ancienne « branch protection » de GitHub, un **ruleset**
se désactive en un clic depuis l'interface, sans avoir à en modifier le
contenu :

1. Aller dans **Settings → Rules → Rulesets** du dépôt.
2. Ouvrir le ruleset concerné (`protection-main` ou `protection-develop`).
3. Passer **Enforcement status** de `Active` à `Disabled` (ou `Evaluate`
   pour observer sans bloquer), puis **Save changes**.

Équivalent en ligne de commande (remplace la valeur `enforcement`) :

```bash
REPO="Fulkiaaa/logichain-api"
ID=$(gh api "repos/$REPO/rulesets" --jq '.[] | select(.name=="protection-main") | .id')
gh api "repos/$REPO/rulesets/$ID" \
  | jq '.enforcement = "disabled" | {name, target, enforcement, conditions, rules, bypass_actors}' \
  > /tmp/ruleset-disable.json
gh api -X PUT "repos/$REPO/rulesets/$ID" --input /tmp/ruleset-disable.json
```

**Aucun acteur de contournement (`bypass_actors`) n'est configuré** sur ces
rulesets : les règles s'appliquent à tout le monde, y compris la
propriétaire du dépôt. C'est un choix volontaire (cohérence de la
démonstration, pas d'exception cachée) — la contrepartie est que la seule
voie de sortie en cas de blocage réellement bloquant (ex. panne de GitHub
Actions) est cette désactivation manuelle du ruleset, à réactiver dès que
la situation est résolue.

N'utiliser cette procédure qu'en cas de réel blocage opérationnel (jamais
pour contourner un check qui échoue légitimement).
