const ONBOARDING_PATHS = [
  '/perfil',
  '/assinatura',
  '/login',
  '/cadastro',
  '/esqueci-senha',
  '/redefinir-senha',
];

export function requiresAdminPin(pinStatus) {
  return pinStatus?.enabled === true && pinStatus?.configured === true;
}

export function shouldPromptPinSetup(pinStatus, currentPath = '') {
  if (pinStatus?.enabled !== true || pinStatus?.configured !== false || pinStatus?.canSet !== true) return false;

  return !ONBOARDING_PATHS.some(
    (path) => currentPath === path || currentPath.startsWith(`${path}?`),
  );
}
