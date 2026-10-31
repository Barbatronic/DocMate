// Forme du brouillon rendu par l'IA. Module sans dépendance : partagé par la page (ai/agent.js,
// ai/mcp.js) et par le serveur MCP local (mcp/server.mjs, sous Node).
export const DRAFT_SCHEMA = {
  type: 'object',
  properties: {
    title: { type: 'string', description: 'Titre court du document' },
    slug: { type: 'string', description: 'kebab-case ASCII, 3 à 6 mots' },
    description: { type: 'string', description: 'Une ou deux phrases de résumé' },
    state: { type: 'string', description: "État à la fin de la session (ex. « en cours », « OK », « à corriger »), vide si inconnu" },
    next_step: { type: 'string', description: 'Prochaine étape évoquée, vide si rien' },
    body: { type: 'string', description: 'Corps Markdown, sans front matter, avec les marqueurs [[media:ID]]' },
    media: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          id: { type: 'string' },
          filename: { type: 'string', description: 'kebab-case ASCII sans extension' },
          alt: { type: 'string' },
          caption: { type: 'string' },
        },
        required: ['id', 'filename', 'alt', 'caption'],
        additionalProperties: false,
      },
    },
  },
  required: ['title', 'slug', 'description', 'state', 'next_step', 'body', 'media'],
  additionalProperties: false,
};
