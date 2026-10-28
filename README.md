# DocMate

**L'assistant de documentation des makers.** Vous travaillez, DocMate capture : webcams, photos du téléphone, captures d'écran de la CAO, et votre voix qui explique ce que vous faites. À la fin, une IA de votre choix rédige la doc en Markdown, images rangées au bon endroit, prête pour votre site (Jekyll, ou simple dossier Markdown).

100 % web, rien à installer : ouvrez la page, c'est parti. Hébergé sur GitHub Pages.

*English below.*

## Comment ça marche

1. **Démarrez une session** et ouvrez une ou plusieurs webcams.
2. **Travaillez en parlant.** Lancez la narration : le micro enregistre en continu. Prenez des photos (P), des clips (V), posez des repères (M) aux moments importants.
3. **Ajoutez le reste** : photos et vidéos du téléphone (QR code), captures d'écran de la CAO, notes écrites, fichiers glissés dans la page.
4. **Générez la doc.** Tout est horodaté sur une même timeline : l'IA sait que la photo de 14 h 32 illustre la phrase « là je serre la vis M3 ». Elle rédige, vous relisez, puis DocMate écrit le `.md` et les médias dans le dossier de votre site (ou vous donne un ZIP).

## Fonctions

| | |
|---|---|
| Webcams | Plusieurs à la fois, photo pleine résolution, clips vidéo (MP4 sous Chrome) avec images clés pour l'IA |
| Narration | Enregistrement continu, découpé en segments de 10 min |
| Téléphone | Scannez le QR code : photos, vidéos, repères et notes partent directement au PC (WebRTC). Ou diffusez la caméra du téléphone en direct comme une webcam de plus |
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

Dans **Générer la doc**, le bouton **📦 Exporter pour un agent** produit un dossier de session `.docmate/session-<date>-<heure>/` à la racine du site :

- `CONSIGNES.md` : la mission (où écrire le document, où copier les médias, front matter, gabarits) et les règles de style ;
- `timeline.md` : la timeline horodatée (paroles, repères, notes) avec le chemin de chaque média ;
- `media/` : photos, captures, vidéos et leurs aperçus.

Sous Chrome, Edge ou Opera, le dossier est écrit directement dans le site. Ailleurs, on obtient un ZIP à décompresser à la racine. Ensuite, dans un terminal ouvert dans le dossier du site :

```bash
claude "Lis le fichier .docmate/session-…/CONSIGNES.md et suis ses instructions"
```

La transcription reste faite par DocMate. Choisissez **Whisper dans le navigateur** pour n'avoir aucune clé à fournir. Ajoutez `.docmate/` au `.gitignore` du site.

### Ollama (100 % local)

Ollama doit accepter les requêtes venant de la page DocMate :

```bash
OLLAMA_ORIGINS="https://barbatronic.fr" ollama serve
```

Utilisez un modèle avec vision (ex. `qwen2.5vl:7b`, `llama3.2-vision`).

### Profils

Variables utilisables dans les chemins et le front matter : `{project}` `{date}` `{slug}` `{title}` `{description}` `{state}` `{next_step}` `{session}`. Dans les gabarits de média : `{url}` `{alt}` `{caption}` `{mime}`.

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

Aucune étape de build : HTML, CSS et modules JavaScript. Les bibliothèques (SDK Anthropic et OpenAI, PeerJS, fflate, transformers.js, qrcode-generator) sont chargées depuis jsDelivr avec une version figée.

```bash
python3 -m http.server 8000
```

Puis ouvrez http://localhost:8000 (les caméras exigent `localhost` ou `https`).

| Fichier | Rôle |
|---|---|
| `js/main.js` | Contrôleur de la page |
| `js/media.js` | Caméras, clips, narration, captures d'écran |
| `js/phonelink.js`, `js/phone.js`, `js/peer-protocol.js` | Liaison téléphone (WebRTC) |
| `js/transcribe.js`, `js/whisper-worker.js` | Transcription (API ou locale) |
| `js/agent.js` | Timeline vers prompt, appel de l'IA, brouillon JSON |
| `js/export.js` | Assemblage, écriture dans le dossier, ZIP |
| `js/profiles.js` | Profils de sortie par défaut |
| `js/i18n.js` | Libellés FR / EN |

Contributions bienvenues : nouveaux profils (Hugo, MkDocs, Docusaurus…), traductions, fournisseurs d'IA.

---

## English

**DocMate is a documentation assistant for makers.** While you work, it captures your webcams, phone photos, CAD screenshots and your voice explaining what you do. At the end, the AI of your choice (Claude, OpenAI, or local Ollama) writes the Markdown doc with media placed where they belong, ready for your Jekyll site or a plain Markdown folder. Everything is timestamped on one timeline, so the AI knows which photo goes with which sentence.

Fully web-based, nothing to install, hosted on GitHub Pages. Bring your own API key (stored only in your browser), or stay 100 % local with in-browser Whisper and Ollama. Chromium browsers write straight into your site folder; Firefox and Safari get a ZIP. The interface is available in English (⚙ Settings › Capture › Language).

## Licence

[MIT](LICENSE) · Adrien Bracq (Barbatronic)
