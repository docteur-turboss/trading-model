<div align="center">
  <h1>Cash Sight (adress register & discovery api documentation)</h1>
  <h6>Ce repository contien toutes les routes (et routines) du micro service d'adress de Cash Sight.</h6>
</div>

### Table des matières.
- [Packages](#packages)
  - [Dev-packages](#dev-packages)
  - [Packages](#packages-1)
- [Backend installation](#backend-installation)
  - [Dépendances](#dépendances)
  - [.env](#env)
- [Démarer le backend de l'application](#démarer-le-backend-de-lapplication)
- [API](#api)
  - [Ajouter un service](#ajouter-un-service)
    - [URL](#url)
    - [Request Parameters :](#request-parameters-)
    - [*Exemple de requête*](#exemple-de-requête)
    - [Response Parameters :](#response-parameters-)
    - [*Exemple de réponse*](#exemple-de-réponse)
  - [Get service](#get-service)
    - [URL](#url-1)
    - [Request Parameters :](#request-parameters--1)
    - [*Exemple de requête*](#exemple-de-requête-1)
    - [Response Parameters :](#response-parameters--1)
    - [*Exemple de réponse*](#exemple-de-réponse-1)
  - [Update service](#update-service)
    - [URL](#url-2)
    - [Request Parameters :](#request-parameters--2)
    - [*Exemple de requête*](#exemple-de-requête-2)
    - [Response Parameters :](#response-parameters--2)
    - [*Exemple de réponse*](#exemple-de-réponse-2)
  - [Delete service](#delete-service)
    - [URL](#url-3)
    - [Request Parameters :](#request-parameters--3)
    - [*Exemple de requête*](#exemple-de-requête-3)
    - [Response Parameters :](#response-parameters--3)
    - [*Exemple de réponse*](#exemple-de-réponse-3)
- [About :](#about-)

## Packages
### Dev-packages
- `@commitlint/cli` - Un module très utile pour la normalisation des noms de commit git [^1].
- `@commitlint/config-conventional`  - configuration conventionnel de commitlint [^2]. 
- `@types/express` - Définitions des types du module express [^3].
- `@types/node` - Définitions des types du module nodejs [^4].
- `@typescript-eslint/eslint-plugin` - Un plugin ESLint qui fournit des règles de contrôle pour les bases de code TypeScript [^5].
- `@typescript-eslint/parser` - Un analyseur ESLint qui exploite TypeScript ESTree pour permettre à ESLint d'analyser le code source TypeScript [^6].
- `eslint` - ESLint est un outil permettant d'identifier et de signaler les schémas trouvés dans le code ECMAScript/JavaScript [^7].
- `husky` - Husky améliore vos commits et plus encore [^8].
- `nodemon` - nodemon est un outil qui redémarre automatiquement l'application node lorsque des changements sont détectés [^9].
- `ts-node` - Exécution TypeScript et REPL pour node.js, avec support source map et ESM natif [^10].
- `typescript` - Javascript avec typage fort [^11].

### Packages
- `axios` - packages pour les requêtes [^12].
- `express` - Framework web minimaliste, rapide et sans opinion pour Node.js [^13].
- `mongoose` - Mongoose est un outil de modélisation d'objets MongoDB conçu pour fonctionner dans un environnement asynchrone [^14].
- `packages` - Toutes les fonctions ou variables partagé sur plusieurs services [^15].

## Backend installation

### Dépendances 

```shell
npm install
```

### .env
```shell
nano ../.env
```

Puis veuillez saisir les information suivantes :
```js
WEBHOOK_ERROR_FOR_DISCORD="Lien de votre webhook discord"
URLDB="L'url de votre base de donnée mongodb"

PORT_APIGATEWAY="Le port où vous souhaitez que l'api gateway écoute"
PORT_ADRESSMANAGER="Le port où vous souhaitez que l'adress manager écoute"

PASSWORD_SERVICE="Le mot de passe qui sécurise tout les services et leurs communications"
TOKEN_EXPIRATION="Le temps d'expiration du token en miliseconde"

IP_APIGATEWAY="l'ip de la machine de l'api gateway (192.168.68.72 si tout roule sur la même machine)"
IP_ADRESSMANAGER="l'ip de la machine de l'adress manager (192.168.68.72 si tout roule sur la même machine)"
IP_SERVICE_WHITELIST="l'ip des machines autorisé à se connecter directement entre services (192.168.68.72 si tout roule sur la même machine)"

NODE_ENV="DEVELOPMENT|PRODUCTION|TEST"
```

## Démarer le backend de l'application
Pour démarer le backend vous avez besoin de faire les étapes précédemment expliquées puis les commandes suivantes.
```shell
npm run build
npm run prod
# OR
npm start
```

## API

### Ajouter un service
#### URL
```http
POST /service
```

#### Request Parameters : 
|  Parameter  | Type     | 
| :---------- | :------: |
| `trust` | `String` | 
| `port`      | `INT`    |
| `adressIP`  | `String` |
| `service`   | `String` |

#### *Exemple de requête*
```js
    let axios = require('axios')
    // ...Code existant...//
    axios.request({
        url: '/service',
        method: 'POST',
        body: {
            trust : process.env.PASSWORD_SERVICE,
            port : process.env.port,
            adressIP : app.ip,
            service : "MAIL"
        },
    })
    .then(res => res.json())
    .then(json => ...)
```

#### Response Parameters :
| Parameter | Type | Description |
| :-------- | :--: | :---------- |
| `success` | `Boolean` | Validation si la requête s'est terminé sans problème où inversement |
| `status` | `Interger` | Le code http de la réponse |
| `data` | `User` | Result de la requête |

#### *Exemple de réponse*
```js
{
  success : true,
  status : 201,
  data : 'Service enregistrée'
}
```

### Get service
#### URL
```http
GET /service
```

#### Request Parameters : 
| Parameter   |   Type   | Description             |
| :---------- | :------: | :---------------------- |
| `trust` | `String` | Les signatures utilisé pour sécuriser les transmissions |
| `service`   | `String` | Votre service recherché |
| `ip`   | `String` | L'ip de la machine du service souhaité |

#### *Exemple de requête*
```js
    let axios = require('axios')
    // ...Code existant...//
    axios.request({
        url: `/service`,
        method: 'GET',
        body: {
            trust : process.env.PASSWORD_SERVICE,
            service : "MAIL",
        },
    })
    .then(res => res.json())
    .then(json => ...)
```

#### Response Parameters :
| Parameter | Type | Description |
| :-------- | :--: | :---------- |
| `success` | `Boolean` | Validation si la requête s'est terminé sans problème où inversement |
| `status` | `Interger` | Le code http de la réponse |
| `data` | `Adress` | Result de la requête |
| `data.service` | `String` | Le nom du service |
| `data.port` | `Number` | Le port qu'il écoute |
| `data.adressIP` | `String` | Son adresse ip |
| `data.status` | `Number` | 0 : hors ligne, 1 : en ligne, 2 : limité pour des raisons de sécurité |

#### *Exemple de réponse*
```js
{
  success : true,
  status : 200,
  data : '[{"service" : "MAIL", "port" : 3000, "adressIP" : "192.168.68.72", "status" : 1}]'
}
```


### Update service
#### URL
```http
PUT /service
```

#### Request Parameters : 
| Parameter   | Type     |
| :---------- | :------: | 
| `trust` | `String` |
| `port`      | `INT`    | 
| `adressIP`  | `String` |
| `service`   | `String` | 
| `status`    | `INT`    | 

#### *Exemple de requête*
```js
    let axios = require('axios')
    // ...Code existant...//
    axios.request({
        url: `/@me`,
        method: 'PUT',
        body: {
            trust : process.env.PASSWORD_SERVICE,
            adressIP : "192.168.68.72",
            service : "MAIL",
            port : 3000,
            status : 0,
        },
    })
    .then(res => res.json())
    .then(json => ...)
```

#### Response Parameters :
| Parameter | Type | Description |
| :-------- | :--: | :---------- |
| `success` | `Boolean` | Validation si la requête s'est terminé sans problème où inversement |
| `title` | `String` | Nom de l'erreur |
| `status` | `Interger` | Le code http de la réponse |
| `data` | `User` | Result de la requête |

#### *Exemple de réponse*
```js
{
  success : true,
  title : "SUCCESS",
  status : 201,
  data : 'Service bien modifié'
}
```


### Delete service
#### URL
```http
DELETE /service
```

#### Request Parameters : 
| Parameter   | Type     |
| :---------- | :------: | 
| `trust` | `String` |
| `adressIP`  | `String` |
| `service`   | `String` |
| `port`      | `INT`    |

#### *Exemple de requête*
```js
    let axios = require('axios')
    // ...Code existant...//
    axios.request({
        url: `/@me`,
        method: 'DELETE',
        body: {
            trust : process.env.PASSWORD_SERVICE,
            adressIP : "192.168.68.72",
            service : "MAIL",
            port : 3000,
        },
    })
    .then(res => res.json())
    .then(json => ...)
```

#### Response Parameters :
| Parameter | Type | Description |
| :-------- | :--: | :---------- |
| `success` | `Boolean` | Validation si la requête s'est terminé sans problème où inversement |
| `status` | `Interger` | Le code http de la réponse |
| `data` | `User` | Result de la requête |

#### *Exemple de réponse*
```js
{
  success : true,
  status : 200,
  data : "Service supprimé des annuaires"
}
```

------------
## About :
- `CHANGELOG` [source](./CHANGELOG.md)

Ref :
[^1]: [Url du dépot `@commitlint/cli`](https://www.npmjs.com/package/@commitlint/cli)
[^2]: [Url du dépot `@commitlint/config-conventional`](https://www.npmjs.com/package/@commitlint/config-conventional)
[^3]: [Url du dépot `@types/express`](https://www.npmjs.com/package/@types/express)
[^4]: [Url du dépot `@types/node`](https://www.npmjs.com/package/@types/node)
[^5]: [Url du dépot `@typescript-eslint/eslint-plugin`](https://www.npmjs.com/package/@typescript-eslint/eslint-plugin)
[^6]: [Url du dépot `@typescript-eslint/parser`](https://www.npmjs.com/package/@typescript-eslint/parser)
[^7]: [Url du dépot `eslint`](https://www.npmjs.com/package/eslint)
[^8]: [Url du dépot `husky`](https://www.npmjs.com/package/husky)
[^9]: [Url du dépot `nodemon`](https://www.npmjs.com/package/nodemon)
[^10]: [Url du dépot `ts-node`](https://www.npmjs.com/package/ts-node)
[^11]: [Url du dépot `typescript`](https://www.npmjs.com/package/typescript)
[^12]: [Url du dépot `axios`](https://www.npmjs.com/package/axios)
[^13]: [Url du dépot `express`](https://www.npmjs.com/package/express)
[^14]: [Url du dépot `mongoose`](https://www.npmjs.com/package/mongoose)
[^15]: [Url du dépot `packages`](https://github.com/Horus-Turboss-Finance/Packages)