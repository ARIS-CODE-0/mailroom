# Mailroom

Mailroom est une application Expo qui permet d’envoyer et de recevoir des emails avec son propre domaine grâce à Resend.

## Installation

Prérequis : Node.js 20 ou plus récent, un compte Resend et un domaine vérifié chez Resend.

```bash
git clone https://github.com/ARIS-CODE-0/mailroom.git
cd mailroom
npm install
npm install --prefix server
cp .env.example .env
cp server/.env.example server/.env
```

Le fichier `.env` à la racine contient uniquement la configuration publique
utilisée par Expo. Les secrets du backend restent dans `server/.env`.

Dans `server/.env`, renseigne :

```env
RESEND_API_KEY=re_xxxxxxxxx
APP_PASSWORD=un-mot-de-passe-long-et-prive
ALLOWED_DOMAINS=example.com
```

Pour obtenir la clé Resend, ouvre le tableau de bord Resend, va dans **API Keys**, crée une clé avec les droits nécessaires, puis copie-la dans `RESEND_API_KEY`. Tu peux aussi utiliser le CLI Resend :

```bash
resend whoami
npm run setup
```

`npm run setup` récupère la clé du profil Resend local, détecte les domaines vérifiés et écrit la configuration dans `server/.env`. Le mot de passe reste lui aussi dans `server/.env`.

## Lancer Mailroom en local

```bash
npm run server:start
npm run expo:start
```

Le backend écoute sur `http://127.0.0.1:3035` et Expo sur
`http://127.0.0.1:8081`. Dans l'application, indique
`http://localhost:3035` comme adresse du serveur.

Pour lancer Expo au premier plan avec son menu et son QR code, tu peux aussi
utiliser `npm start` à la place de `npm run expo:start`.

Commandes Expo disponibles :

```bash
npm start                 # menu Expo
npm run web               # version web
npm run android           # émulateur ou appareil Android
npm run ios               # simulateur iOS sur macOS
npx expo start --go       # ouvrir avec Expo Go
```

Pour utiliser Expo Go sur un téléphone en local, installe Expo Go, connecte le
téléphone et l'ordinateur au même réseau, puis utilise le mode LAN d'Expo.

## Lancer Mailroom avec Tailscale

Tailscale doit être installé et connecté sur l'ordinateur qui héberge Mailroom
et sur l'appareil client. Le relais du projet expose l'API et Expo sur l'IP
Tailscale du serveur, sans modifier le serveur existant sur le réseau local.

Dans `.env`, renseigne uniquement les variables publiques Expo :

```env
EXPO_PUBLIC_API_URL=http://<IP_TAILSCALE_DU_SERVEUR>:3035
EXPO_PUBLIC_TAILSCALE_HOST=<IP_TAILSCALE_DU_SERVEUR>
```

`EXPO_PUBLIC_TAILSCALE_HOST` doit contenir uniquement l'hôte ou l'IP : ne mets
ni `http://`, ni `https://`, ni `:3035`.

Lance les services dans cet ordre :

```bash
npm run server:start
npm run expo:start
npm run tailscale:start
```

Le relais fournit alors :

```text
http://<IP_TAILSCALE_DU_SERVEUR>:3035  → API Mailroom
http://<IP_TAILSCALE_DU_SERVEUR>:8081  → Expo
```

Dans l'application, indique l'adresse API complète avec le port `3035`.
Le port `8081` sert uniquement à charger Expo. `npm run expo:start` est
recommandé ici, car il fait écouter Expo sur `127.0.0.1:8081`, ce qui permet au
relais Tailscale d'utiliser `IP_TAILSCALE:8081`.

Pour arrêter le relais Tailscale :

```bash
npm run tailscale:stop
```

Dans l’application, indique l’adresse du backend, généralement `http://localhost:3035` sur l’ordinateur qui l’héberge, puis le mot de passe `APP_PASSWORD`.

## Build web, iOS et Android

Exporter la version web :

```bash
npm run build
```

Préparer les bundles JavaScript natifs :

```bash
npm run export:native
```

Pour compiler et installer localement une application Android, il faut Android Studio et un émulateur ou un appareil configuré :

```bash
npx expo run:android
```

Pour iOS, il faut macOS et Xcode :

```bash
npx expo run:ios
```

Pour créer des applications installables dans le cloud avec EAS Build :

```bash
npx expo login
npx eas-cli build:configure
npx eas-cli build --platform android
npx eas-cli build --platform ios
```

EAS demande un compte Expo. Le build iOS nécessite également un compte Apple Developer pour signer l’application.

## Données locales

Au premier démarrage du backend, SQLite crée automatiquement `server/data/mail.sqlite`. Cette base contient les emails synchronisés, les brouillons, les préférences et le cache des pièces jointes. Le dossier `server/data/` est ignoré par Git et reste local à chaque installation.

Pour sauvegarder les données :

```bash
npm run backup
```

La sauvegarde est créée dans `server/data/backups/`. Conserve aussi une copie privée de `server/.env`, qui contient la clé Resend et le mot de passe.

## Commandes utiles

```bash
npm run server:status
npm run server:stop
npm run build
npm run check
npm run test:e2e
```

Les tests utilisent un faux transport email et n’envoient pas de message réel.

Le backend (`npm audit --prefix server --omit=dev`) ne présente aucune vulnérabilité. Le graphe Expo/Metro de développement peut encore être signalé par `npm audit` à cause de dépendances transitives de l'outillage natif ; Expo SDK 57 est à jour (`57.0.27`) et `npx expo-doctor` passe. N'utilise pas `npm audit fix --force`, qui propose des versions incompatibles avec Expo.

## Sécurité et périmètre

Ne publie jamais `server/.env`, une base SQLite, une sauvegarde ou un journal. La clé Resend reste uniquement dans le backend ; elle n’est jamais incluse dans l’application Expo.

Cette version est prévue pour une installation personnelle. Chaque installation utilise sa propre clé Resend, son propre domaine et sa propre base locale. Le support de plusieurs comptes sur une même installation nécessitera une authentification multi-utilisateur et une séparation des données par compte.
