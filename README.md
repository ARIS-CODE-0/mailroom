# Mailroom

Application React Native / Expo générique, connectée à Resend. Le backend Node.js conserve les messages dans SQLite. L'application fonctionne sur iOS, Android et le web.

## Version générique et multi-utilisateur

Cette base est maintenant dépersonnalisée : le nom par défaut est `Mailroom`, le domaine est découvert depuis la configuration Resend, et les clés locales sont isolées par installation. Le nom affiché peut être changé avec `EXPO_PUBLIC_APP_NAME` et `EXPO_PUBLIC_APP_TAGLINE`.

Pour une vraie installation partagée par plusieurs personnes, chaque personne doit disposer d’un compte applicatif séparé et de ses propres identifiants Resend. La prochaine étape consiste à remplacer le mot de passe d’installation unique par une table `users`, des sessions liées à un utilisateur, et un coffre de credentials Resend par utilisateur. Les messages, brouillons, identités et domaines seront alors filtrés par `user_id`. Cette séparation est nécessaire avant de donner accès à plusieurs personnes sur une même instance.

## Configuration locale

- Projet : le dossier du dépôt cloné.
- Un domaine vérifié chez Resend doit autoriser l’envoi et la réception.
- API et version web : **http://127.0.0.1:3035** sur le serveur.
- Serveur Expo : **http://127.0.0.1:8081** ; lien Expo Go : **exp://127.0.0.1:8081**.
- Les secrets restent uniquement dans `server/.env`, qui n'est jamais commité.
- Les tests utilisent un transport fictif et n’envoient aucun email réel.

Les processus peuvent être lancés en arrière-plan. Leur démarrage après un redémarrage du serveur nécessite l’installation du service décrit plus bas.

## Accès direct depuis ton téléphone Tailscale

Sur un **iPhone physique**, Expo Go exige le même compte Expo dans le CLI et dans Expo Go. Exécuter `npx expo login`, puis toucher « Try Again » sur le téléphone. Voir la [documentation officielle](https://docs.expo.dev/troubleshooting/expo-go-sign-in-required/).

Expo Go : utiliser l'URL affichée par `npx expo start`. L'API est configurée par `EXPO_PUBLIC_API_URL`.

Un relais écoute uniquement sur l’adresse Tailscale, aux ports 8081 et 3035, et transmet vers les services locaux. Commandes : `npm run tailscale:start` et `npm run tailscale:stop`. La configuration publique est dans `.env` ; aucune clé Resend n’y figure. Expo annonce l’adresse Tailscale dans ses manifestes iOS et Android.

## Ouvrir immédiatement l'application

Depuis ton ordinateur, ouvre un tunnel vers ce serveur (remplace `ADRESSE_DU_SERVEUR` par l'adresse que tu utilises pour SSH) :

```bash
ssh -N -L 3035:127.0.0.1:3035 -L 8081:127.0.0.1:8081 codex@ADRESSE_DU_SERVEUR
```

Laisse cette commande ouverte, puis ouvre **http://localhost:3035** dans ton navigateur. L'adresse du serveur dans l'écran de connexion est `http://localhost:3035`.

Pour lire ton mot de passe sur le serveur :

```bash
cat server/access.txt  # créé localement par npm run setup
```

Si ton ordinateur est sur le même Tailscale, ton adresse ou ton nom DNS Tailscale peut servir d'adresse SSH.

### Émulateur Android / Expo Go

1. Ouvre le tunnel SSH ci-dessus depuis l'ordinateur qui exécute l'émulateur.
2. Installe une version d'Expo Go compatible SDK 57 dans l'émulateur.
3. Depuis cet ordinateur :

```bash
adb reverse tcp:8081 tcp:8081
adb reverse tcp:3035 tcp:3035
adb shell am start -a android.intent.action.VIEW -d 'exp://127.0.0.1:8081'
```

Dans l'application, utilise `http://localhost:3035` comme adresse du serveur. Un appareil Android USB avec le débogage USB activé peut utiliser les mêmes redirections.

### Simulateur iOS

Sur le Mac qui exécute le simulateur, ouvre le tunnel SSH, installe Expo Go compatible SDK 57, puis :

```bash
xcrun simctl openurl booted 'exp://127.0.0.1:8081'
```

L'adresse de l'API reste `http://localhost:3035`.

### Téléphone physique sans USB

Sur le réseau Tailscale configuré ici, utilise directement le lien Expo Go ci-dessus. Hors de ce réseau privé, il faut une adresse HTTPS joignable par le téléphone pour l’API, et un accès au serveur Metro pour Expo Go. Le champ « Adresse du serveur » est modifiable dans l'application ; aucune clé Resend n'est à copier sur le téléphone.

Pour publier HTTPS sur un port dédié, un administrateur peut exécuter cette commande :

```bash
sudo tailscale serve --bg --https=8443 http://127.0.0.1:3035
```

L'application et l'API seront alors accessibles, depuis le même réseau Tailscale, à `https://NOM_DNS_TAILSCALE:8443`. Cette origine doit être ajoutée à `ALLOWED_ORIGINS` sur le backend. Pour Expo Go à distance, lancer Metro avec `npx expo start --tunnel` après `npm run expo:stop`, puis scanner son QR code. Le tunnel Metro ne remplace pas l'accès HTTPS à l'API.

Pour un hébergement Internet public avec ton propre sous-domaine, mettre un reverse proxy HTTPS devant `127.0.0.1:3035`, ajouter son origine exacte à `ALLOWED_ORIGINS`, et utiliser cette URL dans l'application. Aucun domaine public ni règle DNS n'a été modifié ici.

## Fonctionnalités

- Boîte de réception et messages envoyés, synchronisés toutes les 60 secondes ; actualisation manuelle et rafraîchissement de l'interface toutes les 15 secondes.
- Choix libre de l'expéditeur sur un domaine autorisé et vérifié ; noms affichés, adresses préférées et signature.
- Destinataires multiples, Cc, Cci, objet et corps de message.
- Ajout, retrait, téléchargement et partage de pièces jointes ; jusqu'à 20 fichiers, 25 Mo au total par envoi.
- Répondre, répondre à tous et transférer avec pièces jointes ; en-têtes de réponse pour le regroupement chez les destinataires.
- Brouillons sauvegardés automatiquement sur le serveur et accessibles depuis plusieurs appareils ; les adresses encore incomplètes sont acceptées dans les brouillons.
- Recherche dans le dossier courant, pagination, favoris, lu/non lu, archives, corbeille et restauration.
- Protection contre les envois en double grâce à une clé d'idempotence persistante.
- Stockage local durable du contenu des mails et cache des pièces jointes synchronisées, authentification personnelle, session stockée dans SecureStore sur mobile.

Dans **Adresses & préférences**, ajoute les adresses que tu veux retrouver rapidement, par exemple `contact@exemple.fr`. Le champ « De » reste modifiable pour chaque message.

## Installation et développement

Node.js 24 est installé avec NVM sur ce serveur :

```bash
source ~/.nvm/nvm.sh
cd mailroom-open-source
npm ci
npm ci --prefix server
npm run setup
npm run build
npm run server:start
npm run expo:start
```

`setup` importe la clé du profil actif du CLI Resend **sans l'afficher**, découvre les domaines vérifiés et génère un mot de passe applicatif. Il ne remplace jamais un `server/.env` existant. Pour une autre installation sans CLI, copier `server/.env.example` vers `server/.env` et renseigner les valeurs côté serveur.

Pour développer avec le terminal Expo interactif :

```bash
npm run expo:stop
NODE_OPTIONS=--dns-result-order=ipv4first npm start -- --localhost
```

Un fichier `.env` à la racine peut définir `EXPO_PUBLIC_API_URL` si nécessaire. Cette variable est publique ; elle ne doit contenir que l'URL du backend, jamais une clé ou un mot de passe. Par défaut, la version web servie par le backend utilise sa propre origine ; le web de développement sur le port 8081 et les apps natives proposent `http://localhost:3035`.

### Commandes d'exploitation

```bash
npm run server:start
npm run server:status
npm run server:stop
npm run expo:start
npm run expo:stop
npm run backup
```

Les journaux sont dans `server/data/api.log` et `server/data/expo.log`. Après une modification du backend ou du fichier `server/.env`, arrêter puis relancer l'API. Après une modification de l'interface, `npm run build` met à jour la version web ; Metro recharge les apps en développement.

La commande `backup` crée une copie SQLite cohérente dans `server/data/backups/`. Elle inclut mails, pièces jointes, brouillons et préférences. Conserver aussi une copie privée de `server/.env` pour restaurer l'installation. La base, les sauvegardes et les secrets sont exclus de Git.

### Service au redémarrage

Une unité systemd est fournie dans `docs/aris-mail.service`. Son installation nécessite un administrateur :

```bash
cd /path/to/mailroom-open-source
npm run server:stop
sudo cp docs/aris-mail.service /etc/systemd/system/mailroom.service
sudo systemctl daemon-reload
sudo systemctl enable --now mailroom
```

Une fois installé, utiliser `sudo systemctl restart mailroom` pour redémarrer l'API. Mettre à jour le chemin Node de l'unité en cas de changement de version NVM.

## Vérifications

```bash
npm run check          # TypeScript et tests API / adaptateur Resend
npm run build          # Export web
npm run test:e2e       # Parcours Chromium desktop et mobile
npm run export:native # Bundles iOS et Android dans dist-native
npx expo-doctor        # Cohérence des dépendances natives
```

Les tests utilisent une base en mémoire et un faux transport mail : ils n'envoient jamais de mail réel et ne modifient pas ta boîte. Les captures dans `docs/preview-*.png` montrent des données fictives. Les exports iOS/Android et Expo Doctor ont été vérifiés ; aucun émulateur natif n'était disponible sur ce serveur pour un test sur appareil.

Le backend installé a passé son audit npm sans vulnérabilité connue. L'outillage Expo SDK 57 remonte des alertes sur des dépendances transitives (`node-forge`, `braces`, `uuid`) sans correctif compatible proposé au moment de l'installation. Ne pas utiliser `npm audit fix --force`, qui propose ici de rétrograder Expo de façon incompatible. Les serveurs de développement restent sur localhost.

## Périmètre et limites

Cette application est une boîte mail personnelle utilisant l'API Resend, pas un serveur IMAP/POP. Les quotas de ton compte Resend continuent de s'appliquer. La lecture et la rédaction utilisent du texte : les mails HTML sont convertis en texte lisible avec leurs liens, sans charger d'images distantes. Il n'y a pas encore de notifications push, de mode hors ligne complet, de gestion multiutilisateur, de calendrier ni d'éditeur de texte riche.

Les archives, favoris, statuts lu/non lu et la corbeille appartiennent à cette application ; ils ne modifient pas les messages sur le tableau de bord Resend. La corbeille est réversible, sans purge automatique. Les pièces jointes reçues jusqu'à 25 Mo sont mises en cache pendant la synchronisation ; les contenus déjà indisponibles chez Resend avant leur récupération ne peuvent pas être reconstitués.

En cas d'envoi dont le résultat est incertain, réessayer **le même message sans le modifier** réutilise la clé d'idempotence. Après 23 heures sans confirmation, l'application exige une vérification des messages envoyés avant de créer un nouvel envoi.

## Documentation des intégrations

- [Réception sur un domaine personnalisé — Resend](https://resend.com/docs/dashboard/receiving/custom-domains)
- [Liste des mails reçus — Resend](https://resend.com/docs/api-reference/emails/list-received-emails)
- [Envoi de mails — Resend](https://resend.com/docs/api-reference/emails/send-email)
- [Sélection de fichiers — Expo](https://docs.expo.dev/versions/latest/sdk/document-picker/)
