## **Plateforme LogiChain** 

## **1. Contexte et enjeux** 

L’organisation d’événements de grande envergure (festivals, salons professionnels, rassemblements éco-responsables) implique une gestion logistique complexe, souvent soumise à des conditions de terrain dégradées. La traçabilité du matériel, la gestion des flux de prestataires et l’évaluation de l’impact environnemental en temps réel représentent des défis majeurs. 

**LogiChain** est une solution applicative industrielle conçue pour centraliser, tracer et optimiser l'ensemble de la chaîne logistique événementielle, tout en garantissant un fonctionnement fluide aux agents de terrain, même en l'absence de réseau internet. 

## **2. Objectifs du projet** 

- **Centraliser et sécuriser** la gestion des ressources matérielles et humaines sur une infrastructure de données scalable. 

- **Garantir la continuité de service** sur le terrain via une approche Offline-First. 

- **Fournir des outils d'aide à la décision** et de pilotage basés sur des métriques de performance et d'impact environnemental. 

- **Assurer la résilience et la charge** du système face à des pics d'utilisation simultanés (scans massifs lors des phases de montage/démontage). 



1/4 

## **3. Périmètre technique global** 

L'application repose sur une architecture moderne découpée en trois grands piliers interconnectés : 
# 3. Périmètre technique global

L'application repose sur une architecture moderne organisée autour de **trois piliers interconnectés** :

```text
┌──────────────────┐        REST API (HTTPS)        ┌──────────────────┐
│    FRONT-END     │ <────────────────────────────> │     BACK-END     │
└──────────────────┘                                └──────────────────┘
         ▲                                                  │
         │                                                  │
         │             WebSockets / SSE                     │
         └──────────────────────────────────────────────────┘
                                                            │
                                                            │ CRUD / ACID
                                                            ▼
                                                  ┌──────────────────┐
                                                  │     DATABASE     │
                                                  └──────────────────┘
```

---

## 1. Front-End

Le front-end constitue l'interface utilisateur de l'application. Il est conçu selon une approche **Mobile-First** afin d'offrir une expérience optimale sur smartphones, tablettes et ordinateurs.

### Fonctionnalités principales

- **Progressive Web App (PWA)**
  - Installation possible sur mobile et desktop.
  - Fonctionnement similaire à une application native.

- **Mode hors ligne**
  - Utilisation de **Service Workers** et **Workbox**.
  - Mise en cache des ressources pour continuer à utiliser l'application sans connexion.

- **Tableau de bord**
  - Développé avec **React**, **Vue** ou **Angular**.

- **Numérisation**
  - Lecture de QR Codes et codes-barres.

- **Stockage local**
  - Utilisation d'**IndexedDB** pour conserver les données en local avant leur synchronisation.

### Communication

Le front-end communique avec le back-end via :

- API REST sécurisée (HTTPS)
- Échanges JSON
- WebSockets / Server-Sent Events pour les notifications en temps réel

---

## 2. Back-End

Le back-end centralise toute la logique métier et expose les services consommés par le front-end.

### Technologies

- Node.js
- Express

### Responsabilités

- Exposition des API REST
- Validation des données (JSON Schema)
- Exécution de la logique métier
- Authentification JWT
- Gestion des notifications temps réel (WebSockets / SSE)

### Communication

Le back-end :

- reçoit les requêtes REST du front-end ;
- échange avec MongoDB pour lire et écrire les données ;
- diffuse les événements en temps réel aux clients connectés.

---

## 3. Base de données

Les données sont stockées dans **MongoDB**, une base de données orientée documents.

### Caractéristiques

- Modèle de documents BSON
- Collections principales :
  - Events
  - Items
  - Routes

- Documents imbriqués
  - Historisation des données

- GeoJSON
  - Gestion des données géographiques

- Time Series
  - Stockage des données de monitoring

- Replica Set
  - Haute disponibilité
  - Tolérance aux pannes

- Index optimisés
  - Index composites
  - Index géographiques

---

# Flux de communication

## API REST

Le front-end envoie des requêtes HTTPS au back-end :

```
Front-End
     │
     ├── Requête REST (JSON)
     ▼
Back-End
     │
     ├── Lecture / Écriture
     ▼
MongoDB
```

---

## Temps réel

Les alertes sont envoyées instantanément grâce aux WebSockets ou aux Server-Sent Events.

```
MongoDB
    │
    ▼
Back-End
    │
    ├── WebSockets / SSE
    ▼
Front-End
```

---

## Accès à la base

Le back-end effectue différents types d'opérations sur MongoDB :

- **CRUD**
  - Create
  - Read
  - Update
  - Delete

- **Transactions ACID**
  - Atomicité
  - Cohérence
  - Isolation
  - Durabilité

- **Change Streams**
  - Surveillance des modifications de la base.
  - Déclenchement d'événements en temps réel.

---

# Résumé de l'architecture

| Couche | Rôle |
|---------|------|
| **Front-End** | Interface utilisateur, mode hors ligne, scan, stockage local |
| **Back-End** | API REST, logique métier, authentification, temps réel |
| **MongoDB** | Persistance des données, transactions, géolocalisation, monitoring |

L'ensemble de ces composants forme une architecture **moderne, scalable et orientée temps réel**, garantissant une bonne séparation des responsabilités, une haute disponibilité des données et une excellente expérience utilisateur.

## Infrastructure et base de données 

- **Technologie principale :** MongoDB. 

- **Modélisation :** Approche documentaire dénormalisée, utilisation de documents imbriqués (nested documents) pour l'historisation, collections de séries temporelles (Time Series) pour les données de monitoring, et structures GeoJSON pour la cartographie. 

- **Rigueur :** Validation native des schémas, gestion de transactions ACID et optimisation avancée des index (composés, partiels, géospatiaux). 



2/4 

## **4. Fonctionnalités clés par profil utilisateur** 

## **Administrateurs & Responsables logistiques** 

- Configuration globale de l'événement et découpage cartographique des zones (coordonnées géospatiales). 

- Suivi des indicateurs clés (KPI) via un tableau de bord d'agrégation : état des stocks, calcul de l'empreinte carbone consolidée en temps réel, détection des goulots d'étranglement. 

- Supervision des transferts de responsabilité et validation des feuilles de route des transporteurs. 

## **Agents de terrain & Prestataires (Interface PWA Mobile)** 

- Consultation des tâches logistiques et des plannings de livraison assignés. 

- Scan des équipements pour validation des étapes de livraison, de mouvement ou de maintenance (mode connecté ou déconnecté). 

- Déclaration d'anomalies géolocalisées avec mise à jour immédiate de l'état de l'item. 

- Réception de notifications critiques en cas de modification d'urgence sur leur secteur. 

## **5. Contraintes et exigences non-fonctionnelles** 

- **Programmation Orientée Objet (POO) obligatoire :** L'ensemble du code de l'API doit être structuré autour du paradigme objet. L'usage de fonctions isolées ou de scripts procéduraux est interdit pour la logique métier et l'accès aux données. Les concepts d'encapsulation, d'héritage (si justifié) et de polymorphisme devront être visibles. 

- **Découpage architectural strict (N-Tier) :** Pour garantir la maintenabilité et la testabilité du code, les responsabilités de l'API doivent être cloisonnées selon le pattern suivant : 

   - **Entity / Model :** Définition des objets métiers de l'application et de leurs règles de validation (en adéquation avec les schémas MongoDB). 

   - **Repository :** Couche exclusive d'accès à la base de données. Aucun composant en dehors des repositories n'est autorisé à interagir avec le driver MongoDB ou l'ORM/ODM (ex: Mongoose). C'est ici que sont isolées les requêtes et les pipelines d'agrégation. 

   - **Service :** Couche contenant l'intégralité de la logique métier, des calculs (ex: empreinte carbone) et des règles de gestion. Les services orchestrent les repositories et sont totalement indépendants du protocole HTTP. 

   - **Controller / Routing :** Point d'entrée de l'application chargé de réceptionner les requêtes, d'appeler les services appropriés et de retourner la réponse HTTP. 



3/4 

- **Architecture REST stricte :** L'API doit adhérer rigoureusement aux contraintes du modèle de maturité de Richardson (niveau 2 minimum). 

   - Utilisation correcte et sémantique des verbes HTTP ( `GET` , `POST` , `PUT` , `PATCH` , `DELETE` ). 

   - Structure d'URLs basée sur les ressources (ex: `/api/v1/events/{id}/items` ). 

   - Utilisation standardisée des codes de statut HTTP ( `200 OK` , `201 Created` , `400 Bad Request` , `401 Unauthorized` , `422 Unprocessable Entity` , etc.) pour refléter fidèlement le résultat de l'opération. 

- **Sécurité par conception (Security by Design) :** Chiffrement des communications, contrôle d'accès strict aux ressources de l'API, et validation systématique de l'intégrité des données à l'entrée de la base de données. 

- **Robustesse du mode déconnecté :** Aucune perte de données ne sera tolérée lors des phases de transition réseau. Le mécanisme de synchronisation doit intégrer un système de verrouillage optimiste pour gérer les accès concurrents sur un même document. 

- **Performance :** Temps de réponse de l'API inférieur à un seuil critique sur les requêtes fréquentes, garanti par une stratégie d'indexation chirurgicale et validé par des tests de charge intensifs. 



4/4 

