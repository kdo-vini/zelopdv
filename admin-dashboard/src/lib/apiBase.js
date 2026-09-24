export function getApiBase({ dev = import.meta.env.DEV } = {}) {
  return dev ? 'http://localhost:5173' : 'https://zelopdv.com.br'
}

export const API_BASE = getApiBase()
