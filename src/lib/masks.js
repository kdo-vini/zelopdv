// Input formatting masks for Brazilian document and phone fields

/**
 * Formats a phone number as (XX) XXXXX-XXXX (mobile) or (XX) XXXX-XXXX (landline).
 */
export function maskPhone(value) {
  let d = (value || '').replace(/\D/g, '');
  if (d.length > 11 && d.startsWith('55')) d = d.slice(2);
  d = d.slice(0, 11);
  if (!d) return '';
  if (d.length <= 2) return `(${d}`;
  if (d.length <= 6) return `(${d.slice(0, 2)}) ${d.slice(2)}`;
  if (d.length <= 10) return `(${d.slice(0, 2)}) ${d.slice(2, 6)}-${d.slice(6)}`;
  return `(${d.slice(0, 2)}) ${d.slice(2, 7)}-${d.slice(7)}`;
}

/**
 * Normalizes Brazilian phone numbers for WhatsApp/API use.
 * Accepts local DDD formats (11999999999) and E.164-ish BR formats (+5511999999999).
 * Returns digits only with country code 55, or null when the number is unusable.
 */
export function normalizeBrazilianPhone(value) {
  let digits = (value || '').replace(/\D/g, '');
  if (!digits) return null;

  if (digits.startsWith('00')) digits = digits.slice(2);

  if (digits.startsWith('55')) {
    const national = digits.slice(2);
    if (national.length === 10 || national.length === 11) return `55${national}`;
    return null;
  }

  if (digits.length === 10 || digits.length === 11) return `55${digits}`;
  return null;
}

export function normalizeBrazilianTaxId(value) {
  const digits = (value || '').replace(/\D/g, '');
  if (digits.length === 11 || digits.length === 14) return digits;
  return null;
}

function hasOnlyRepeatedDigits(value) {
  return /^(\d)\1+$/.test(value);
}

export function isValidCPF(value) {
  const cpf = (value || '').replace(/\D/g, '');
  if (cpf.length !== 11 || hasOnlyRepeatedDigits(cpf)) return false;

  let sum = 0;
  for (let i = 0; i < 9; i += 1) {
    sum += Number(cpf[i]) * (10 - i);
  }
  let digit = 11 - (sum % 11);
  if (digit >= 10) digit = 0;
  if (digit !== Number(cpf[9])) return false;

  sum = 0;
  for (let i = 0; i < 10; i += 1) {
    sum += Number(cpf[i]) * (11 - i);
  }
  digit = 11 - (sum % 11);
  if (digit >= 10) digit = 0;

  return digit === Number(cpf[10]);
}

export function isValidCNPJ(value) {
  const cnpj = (value || '').replace(/\D/g, '');
  if (cnpj.length !== 14 || hasOnlyRepeatedDigits(cnpj)) return false;

  const firstWeights = [5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2];
  const secondWeights = [6, ...firstWeights];

  const calculateDigit = (base, weights) => {
    const sum = weights.reduce((acc, weight, index) => acc + Number(base[index]) * weight, 0);
    const remainder = sum % 11;
    return remainder < 2 ? 0 : 11 - remainder;
  };

  const firstDigit = calculateDigit(cnpj, firstWeights);
  if (firstDigit !== Number(cnpj[12])) return false;

  const secondDigit = calculateDigit(cnpj, secondWeights);
  return secondDigit === Number(cnpj[13]);
}

export function isValidBrazilianTaxId(value) {
  const digits = (value || '').replace(/\D/g, '');
  if (digits.length === 11) return isValidCPF(digits);
  if (digits.length === 14) return isValidCNPJ(digits);
  return false;
}

/**
 * Formats a CPF as XXX.XXX.XXX-XX.
 */
export function maskCPF(value) {
  const d = (value || '').replace(/\D/g, '').slice(0, 11);
  if (!d) return '';
  if (d.length <= 3) return d;
  if (d.length <= 6) return `${d.slice(0, 3)}.${d.slice(3)}`;
  if (d.length <= 9) return `${d.slice(0, 3)}.${d.slice(3, 6)}.${d.slice(6)}`;
  return `${d.slice(0, 3)}.${d.slice(3, 6)}.${d.slice(6, 9)}-${d.slice(9)}`;
}

/**
 * Formats a CNPJ as XX.XXX.XXX/XXXX-XX.
 */
export function maskCNPJ(value) {
  const d = (value || '').replace(/\D/g, '').slice(0, 14);
  if (!d) return '';
  if (d.length <= 2) return d;
  if (d.length <= 5) return `${d.slice(0, 2)}.${d.slice(2)}`;
  if (d.length <= 8) return `${d.slice(0, 2)}.${d.slice(2, 5)}.${d.slice(5)}`;
  if (d.length <= 12) return `${d.slice(0, 2)}.${d.slice(2, 5)}.${d.slice(5, 8)}/${d.slice(8)}`;
  return `${d.slice(0, 2)}.${d.slice(2, 5)}.${d.slice(5, 8)}/${d.slice(8, 12)}-${d.slice(12)}`;
}

/**
 * Auto-detects CPF (≤11 digits) or CNPJ (>11 digits) and applies the appropriate mask.
 */
export function maskDocumento(value) {
  const digits = (value || '').replace(/\D/g, '');
  if (digits.length <= 11) return maskCPF(value);
  return maskCNPJ(value);
}
