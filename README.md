# DocMate

**L'assistant de documentation des makers.** Vous travaillez, DocMate capture : webcams, photos du téléphone, captures d'écran de la CAO, et votre voix qui explique ce que vous faites. À la fin, une IA de votre choix rédige la doc en Markdown, images rangées au bon endroit, prête pour votre site (Jekyll, ou simple dossier Markdown).

100 % web, rien à installer : ouvrez la page, c'est parti. Hébergé sur GitHub Pages.

*English below.*

## Comment ça marche

1. **Ouvrez DocMate** et une ou plusieurs webcams. Tout ce que vous capturez va dans la **session en cours**, que vous retrouvez à chaque ouverture, même le lendemain. Pour un nouveau sujet : **Nouvelle** ; pour reprendre un ancien : **Sessions › Ouvrir**. Donnez-lui un nom en cliquant dessus, sous le logo.
2. **Travaillez en parlant.** Lancez la narration : le micro enregistre en continu. Prenez des photos (P), des clips (V), posez des repères (M) aux moments importants.
3. **Ajoutez le reste** : photos et vidéos du téléphone (QR code), captures d'écran de la CAO, notes écrites, fichiers glissés dans la page.
4. **Générez la doc.** Tout est horodaté sur une même timeline : l'IA sait que la photo de 14 h 32 illustre la phrase « là je serre la vis M3 ». Elle rédige, vous relisez, puis DocMate écrit le `.md` et les médias dans le dossier de votre site (ou vous donne un ZIP).

## Fonctions

| | |
|---|---|
| Webcams | Plusieurs à la fois, photo pleine résolution, clips vidéo (MP4 sous Chrome) avec images clés pour l'IA |
| Cadrage PTZ | Pour les caméras pilotables (Elgato Facecam, Logitech MX Brio, Insta360 Link, Obsbot…) : déplacement, zoom, recentrage et 3 positions mémorisées par caméra. Navigateurs Chromium |
| Narration | Enregistrement continu, découpé en segments de 10 min, sauvegardé toutes les 5 s : rien n'est perdu si l'onglet se ferme ou plante |
| Téléphone | Scannez le QR code (lien privé, valable tant que l'onglet DocMate reste ouvert). Le téléphone devient une **télécommande** (narration, photo et clip des webcams, repère, capture), un **micro sans fil** pour la narration, une **caméra en direct**, et envoie ses photos, vidéos et notes directement au PC (WebRTC) |
| Captures d'écran | Dossier surveillé (vos raccourcis habituels, ex. Impr. écran), bouton Capture (partage d'écran), coller (Ctrl+V), glisser-déposer |
| Transcription | API Whisper (OpenAI, Groq ou compatible) ou **Whisper dans le navigateur** (gratuit, hors ligne) |
| IA de rédaction | **Claude** (Anthropic), **OpenAI** ou API compatible, **Ollama** (local, gratuit), ou **export pour un agent** (Claude Code, Codex CLI…) pour utiliser un abonnement sans clé API |
| Sortie | Profils configurables : Jekyll `_posts`, Jekyll collection de logs par projet, Markdown simple. Importables / exportables en JSON |
| Style | Donnez 2 ou 3 de vos docs : l'IA imite votre ton. Avec un dossier de site, les docs récentes du projet sont prises automatiquement |
| Barre flottante | Mini-barre Photo / Clip / Repère / Narration toujours au-dessus de la CAO |

## Navigateurs

DocMate détecte les fonctions disponibles et l'indique au démarrage.

| Fonction | Chrome, Edge, Opera, Brave | Firefox, Safari |
|---|---|---|
| Caméras, micro, téléphone, transcription, IA | ✓ | ✓ |
| Écriture directe dans le dossier du site | ✓ | ZIP à décompresser |
| Dossier de captures surveillé | ✓ | glisser-déposer, Ctrl+V, bouton Capture |
| Barre flottante | ✓ (Chrome, Edge) | ✗ |

## Configuration

Ouvrez **⚙ Réglages** :

- **IA** : choisissez le fournisseur et collez votre clé API ([Anthropic](https://console.anthropic.com/), [OpenAI](https://platform.openai.com/api-keys)). Les clés restent dans votre navigateur et ne sont envoyées qu'au fournisseur choisi.
- **Transcription** : API Whisper (réutilise la clé OpenAI par défaut) ou Whisper local (le modèle se télécharge au premier usage).
- **Profil de sortie** : où ranger le document et les médias, front matter, gabarits d'image et de vidéo.
- **Capture** : micro, son des clips, dossier de captures d'écran à surveiller.

### Sans clé API : export pour un agent

Les abonnements Claude (Pro, Max) et ChatGPT (Plus, Pro) ne donnent pas de clé API. Mais ils fonctionnent avec les agents en ligne de commande, comme [Claude Code](https://claude.com/claude-code) ou [Codex CLI](https://github.com/openai/codex).

Dans **Générer la doc**, le bouton **📦 Exporter pour un agent** produit un dossier de session `_docmate/session-<date>-<heure>/` à la racine du site :

- `CONSIGNES.md` : la mission (où écrire le document, où copier les médias, front matter, gabarits) et les règles de style ;
- `timeline.md` : la timeline horodatée (paroles, repères, notes) avec le chemin de chaque média ;
- `media/` : photos, captures, vidéos et leurs aperçus.

Sous Chrome, Edge ou Opera, le dossier est écrit directement dans le site. Ailleurs, on obtient un ZIP à décompresser à la racine. Ensuite, dans un terminal ouvert dans le dossier du site :

```bash
claude "Lis le fichier _docmate/session-…/CONSIGNES.md et suis ses instructions"
```

La transcription reste faite par DocMate. Choisissez **Whisper dans le navigateur** pour n'avoir aucune clé à fournir. Ajoutez `_docmate/` au `.gitignore` du site.

### Ollama (100 % local)

Ollama doit accepter les requêtes venant de la page DocMate :

```bash
OLLAMA_ORIGINS="https://barbatronic.fr" ollama serve
```

Utilisez un modèle avec vision (ex. `qwen2.5vl:7b`, `llama3.2-vision`).

### Profils

Variables utilisables dans les chemins et le front matter : `{project}` `{date}` `{slug}` `{title}` `{description}` `{state}` `{next_step}` `{session}` (temps de travail, sans les pauses de plus de 30 min). Dans les gabarits de média : `{url}` `{alt}` `{caption}` `{mime}`.

Exemple (Jekyll, logs par projet) :

```
Document : _logs/{project}/{date}-{slug}.md
Médias :   assets/img/projets/{project}/{date}-{slug}/
URL :      /assets/img/projets/{project}/{date}-{slug}
```

Les documents sont créés avec `published: false` : relisez avant de publier.

## Vie privée

- Aucun serveur DocMate : les sessions, médias et clés restent dans votre navigateur (IndexedDB, localStorage).
- Les médias du téléphone vont directement au PC en WebRTC. Le serveur public [PeerJS](https://peerjs.com/) ne sert qu'à la mise en relation.
- Seuls la transcription et les images (réduites) partent au fournisseur d'IA que vous choisissez. Avec Whisper local et Ollama, rien ne quitte votre machine.

## Développement

Aucune étape de build : HTML, CSS et modules JavaScript, servis tels quels (GitHub Pages). Les bibliothèques (SDK Anthropic et OpenAI, PeerJS, fflate, transformers.js, qrcode-generator) sont chargées depuis jsDelivr avec une version figée. Le `package.json` ne sert qu'au serveur de développement et aux tests.

```bash
npm install        # une fois : outils de test (Playwright)
npm run serve      # http://localhost:8765 (PORT=… pour un autre port)
```

Le serveur de développement désactive le cache : un rechargement prend toujours les derniers modules. Les caméras et le micro exigent `localhost` ou `https` ; ouverte en `file://`, la page ne peut pas charger ses modules.

### Architecture

```
js/
  main.js      point d'entrée : branche les modules dans l'ordre, puis démarre
  core/        briques sans dépendance : bus d'événements, DOM, i18n, icônes, réglages, stockage (IndexedDB)
  session/     session courante et ses éléments (seule source de vérité), transcription des narrations
  capture/     tuiles caméra et PTZ, micro, narration, écran, import de fichiers, état d'enregistrement
  phone/       protocole WebRTC, liaison côté PC, télécommande, page téléphone
  ai/          rédaction par l'IA, transcription (API ou Whisper local dans un worker)
  output/      profils de sortie, export Markdown / ZIP, export pour un agent
  ui/          barre d'outils et d'état, timeline, vue détaillée, barre flottante, dialogues
```

Les dépendances vont dans un seul sens : `core` ← `session` ← `capture` / `phone` ← `ui`. Les modules se préviennent par le bus (`core/bus.js`, liste des événements en tête du fichier) : une capture appelle `addEvent()`, qui annonce `event:added`, et la timeline, la barre d'état, la barre flottante et la télécommande du téléphone se mettent à jour d'elles-mêmes.

Repères :

- Ajouter une source de capture : appeler `addEvent(meta, {blob})` (`session/session.js`) ; rien d'autre à brancher.
- Ajouter un réglage : valeur par défaut dans `core/settings.js`, champ `data-k="chemin.du.réglage"` dans le dialogue des réglages (`index.html`).
- Libellés : le HTML est en français ; traductions et textes affichés par le code dans `core/i18n.js`.
- Couleurs et composants : jetons repris de VibeCAD en tête de `css/app.css`.
- `ai/whisper-worker.js` modifié : incrémenter `WORKER_VERSION` dans `ai/transcribe.js` (le navigateur garde les workers en cache).

### Tests

Parcours navigateur (Playwright, Chromium avec caméra et micro simulés) dans `tests/e2e/` :

```bash
npx playwright install chromium   # une fois
npm test             # tout sauf les tests réseau
npm run test:phone   # téléphone (serveur PeerJS en ligne) et vrai Whisper local (téléchargement du modèle)
npm run test:all
```

Contributions bienvenues : nouveaux profils (Hugo, MkDocs, Docusaurus…), traductions, fournisseurs d'IA.

---

## English

**DocMate is a documentation assistant for makers.** While you work, it captures your webcams, phone photos, CAD screenshots and your voice explaining what you do. At the end, the AI of your choice (Claude, OpenAI, or local Ollama) writes the Markdown doc with media placed where they belong, ready for your Jekyll site or a plain Markdown folder. Everything is timestamped on one timeline, so the AI knows which photo goes with which sentence.

Fully web-based, nothing to install, hosted on GitHub Pages. Bring your own API key (stored only in your browser), or stay 100 % local with in-browser Whisper and Ollama. Chromium browsers write straight into your site folder; Firefox and Safari get a ZIP. The interface is available in English (⚙ Settings › Capture › Language).

## Licence

[MIT](LICENSE) · Adrien Bracq (Barbatronic)
