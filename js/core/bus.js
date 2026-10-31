// Bus d'événements de l'application : les modules se préviennent sans dépendre les uns des autres.
//
//   session            la session courante a changé (ouverte, nouvelle, supprimée)
//   event:added   ev   un élément est arrivé dans la timeline (capture, téléphone, import…)
//   event:changed ev   un élément a été modifié (légende, transcription…)
//   event:removed ev   un élément a été supprimé
//   transcribe:status {ev, text, err}   progression ou erreur de transcription d'une narration
//   status             état d'enregistrement, caméras, micro ou téléphones changé
//   level         lvl  niveau du micro pendant la narration (0 à 1)
//   detail        ev   élément ouvert dans la vue détaillée (null : retour aux caméras)
//   open          ev   demande d'ouverture d'un élément dans la vue détaillée
//   mcp           {connected, replaced}   liaison avec l'outil d'IA de l'utilisateur (ai/mcp.js) changée

const listeners = new Map();

export function on(type, fn) {
  if (!listeners.has(type)) listeners.set(type, new Set());
  listeners.get(type).add(fn);
  return () => listeners.get(type).delete(fn);
}

export function emit(type, payload) {
  for (const fn of listeners.get(type) || []) {
    try {
      fn(payload);
    } catch (e) {
      console.error(`Bus « ${type} »`, e);
    }
  }
}
