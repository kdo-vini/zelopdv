import { env } from '$env/dynamic/private';

const DEFAULT_APP_URL = 'https://zelopdv.com.br';

export function buildServerAuthRedirectUrl(path, fallbackOrigin = '') {
  const origin =
    env.PUBLIC_APP_URL ||
    env.VITE_PUBLIC_APP_URL ||
    fallbackOrigin ||
    DEFAULT_APP_URL;

  try {
    return new URL(path, origin).toString();
  } catch {
    return `${DEFAULT_APP_URL}${path.startsWith('/') ? path : `/${path}`}`;
  }
}

export function isValidEmail(email) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(email || '').trim());
}
