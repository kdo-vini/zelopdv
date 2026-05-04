const configuredAppOrigin = normalizeOrigin(
	import.meta.env.PUBLIC_APP_URL || import.meta.env.VITE_PUBLIC_APP_URL
);

function normalizeOrigin(value) {
	if (!value) return '';
	const trimmed = String(value).trim();
	if (!trimmed) return '';

	const withProtocol = /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;

	try {
		return new URL(withProtocol).origin;
	} catch {
		return trimmed.replace(/\/+$/, '');
	}
}

function getCurrentOrigin() {
	if (typeof window === 'undefined') return '';
	return window.location?.origin || '';
}

export function getAuthRedirectUrl(path) {
	const origin = configuredAppOrigin || getCurrentOrigin();
	if (!origin) return path;

	try {
		return new URL(path, `${origin}/`).toString();
	} catch {
		return `${origin}${path.startsWith('/') ? path : `/${path}`}`;
	}
}
