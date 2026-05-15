export const APP_VERSION = __ZELO_BUILD_VERSION__;

export function normalizeVersion(value) {
  return String(value || '').trim();
}
