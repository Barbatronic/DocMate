// Profils de sortie : où ranger le .md et les médias, et comment les écrire.
// Variables disponibles dans les chemins et gabarits :
//   {project} {date} {slug} {title} {description} {state} {next_step} {session}
// Gabarits de média : {url} {alt} {caption} {mime}

const STYLE_FR =
  'Français, ton technique, phrases courtes, à la première personne. Pas de remplissage.\n' +
  'Structure en sections `##` (par exemple : Objectif, les étapes du travail, Conclusion).';

const JEKYLL_IMAGE = "![{alt}]({{ '{url}' | relative_url }})\n*{caption}*";
const JEKYLL_VIDEO =
  '<video controls preload="metadata" playsinline width="100%">\n' +
  "  <source src=\"{{ '{url}' | relative_url }}\" type=\"{mime}\">\n" +
  '</video>\n\n*{caption}*';

export const PRESETS = [
  {
    id: 'jekyll-posts',
    name: 'Jekyll · articles (_posts)',
    docPath: '_posts/{date}-{slug}.md',
    assetsDir: 'assets/images/{date}-{slug}',
    assetsUrl: '/assets/images/{date}-{slug}',
    projectsDir: '',
    projectFile: '',
    frontMatter:
      '---\nlayout: post\ntitle: "{title}"\ndate: {date}\ndescription: "{description}"\npublished: false\n---\n',
    imageTemplate: JEKYLL_IMAGE,
    videoTemplate: JEKYLL_VIDEO,
    webMaxPx: 2000,
    styleGuide: STYLE_FR,
    examples: [],
  },
  {
    id: 'jekyll-logs-barbatronic',
    name: 'Jekyll · logs par projet (barbatronic.fr)',
    docPath: '_logs/{project}/{date}-{slug}.md',
    assetsDir: 'assets/img/projets/{project}/{date}-{slug}',
    assetsUrl: '/assets/img/projets/{project}/{date}-{slug}',
    projectsDir: '_projects',
    projectFile: '_projects/{project}.md',
    frontMatter:
      '---\ntitle: "{title}"\ndate: {date}\nproject: {project}\ndescription: "{description}"\n' +
      'session: "{session}"\nstate: "{state}"\nnext_step: "{next_step}"\npublished: false\n---\n',
    imageTemplate: JEKYLL_IMAGE,
    videoTemplate: JEKYLL_VIDEO.replace('</video>', '  Votre navigateur ne sait pas lire cette vidéo.\n</video>'),
    webMaxPx: 2000,
    styleGuide:
      STYLE_FR +
      '\nJamais de tiret long (U+2014) ni de tiret demi-cadratin (U+2013) : utiliser « : », « / », « · », « - » ou une virgule.',
    examples: [],
  },
  {
    id: 'markdown',
    name: 'Markdown simple (un dossier par doc)',
    docPath: '{date}-{slug}/README.md',
    assetsDir: '{date}-{slug}/images',
    assetsUrl: 'images',
    projectsDir: '',
    projectFile: '',
    frontMatter: '# {title}\n\n> {description}\n',
    imageTemplate: '![{alt}]({url})\n*{caption}*',
    videoTemplate: '<video src="{url}" controls width="100%"></video>\n\n*{caption}*',
    webMaxPx: 2000,
    styleGuide: STYLE_FR,
    examples: [],
  },
];

export const fill = (tpl, vars) => tpl.replace(/\{(\w+)\}/g, (m, k) => (k in vars ? vars[k] : m));

// Valeur sûre dans une chaîne YAML entre guillemets.
const yaml = (s) => String(s ?? '').replace(/\\/g, '\\\\').replace(/"/g, '\\"').replace(/\n/g, ' ');

export function frontMatter(profile, vars) {
  const safe = Object.fromEntries(Object.entries(vars).map(([k, v]) => [k, yaml(v)]));
  return fill(profile.frontMatter, safe);
}

export function slugify(s) {
  return (
    String(s || '')
      .normalize('NFD')
      .replace(/[̀-ͯ]/g, '')
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 60) || 'doc'
  );
}

export function exportProfile(p) {
  const blob = new Blob([JSON.stringify(p, null, 2)], { type: 'application/json' });
  const a = Object.assign(document.createElement('a'), {
    href: URL.createObjectURL(blob),
    download: `docmate-profil-${slugify(p.name)}.json`,
  });
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}

export function importProfile(text) {
  const p = JSON.parse(text);
  const base = structuredClone(PRESETS[0]);
  for (const k of Object.keys(base)) if (k in p) base[k] = p[k];
  base.id = 'custom-' + Date.now().toString(36);
  return base;
}
