const PROFILE_ANCHOR_TABS = Object.freeze({
  logo: 'perfil',
  documento: 'empresa',
  'largura-bobina': 'preferencias',
});

export function resolveProfileAnchor(hash = '') {
  const anchor = String(hash).replace(/^#/, '');
  const tab = PROFILE_ANCHOR_TABS[anchor];
  return tab ? { anchor, tab } : null;
}
