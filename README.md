# Mailroom

Mailroom est une application Expo qui permet d’envoyer et de recevoir des emails avec son propre domaine grâce à Resend.

## Installation

Prérequis : Node.js 20 ou plus récent, un compte Resend et un domaine vérifié chez Resend.

```bash
git clone https://github.com/ARIS-CODE-0/mailroom.git
cd mailroom
npm install
npm install --prefix server
cp server/.env.example server/.env
```

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

## Lancer Mailroom

```bash
npm run server:start
npm start
```

Expo affiche une URL et un QR code. Tu peux ouvrir Mailroom avec `w` dans un navigateur, scanner le QR code avec Expo Go sur le même réseau, ou utiliser un émulateur Android/iOS.

Dans l’application, indique l’adresse du backend, généralement `http://localhost:3035` sur l’ordinateur qui l’héberge, puis le mot de passe `APP_PASSWORD`.

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

## Sécurité et périmètre

Ne publie jamais `server/.env`, une base SQLite, une sauvegarde ou un journal. La clé Resend reste uniquement dans le backend ; elle n’est jamais incluse dans l’application Expo.

Cette version est prévue pour une installation personnelle. Chaque installation utilise sa propre clé Resend, son propre domaine et sa propre base locale. Le support de plusieurs comptes sur une même installation nécessitera une authentification multi-utilisateur et une séparation des données par compte.
