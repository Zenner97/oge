const encoder = new TextEncoder();
const ITERATIONS = 600_000;

export const nowSeconds = () => Math.floor(Date.now() / 1000);
export const token = () => base64url(crypto.getRandomValues(new Uint8Array(32)));
export const userId = () => crypto.randomUUID();
export const normalizeTelegram = (value) => String(value ?? '').trim().replace(/^@/, '').toLowerCase();
export const validTelegram = (value) => /^[a-z][a-z0-9_]{4,31}$/.test(value);
export const validPassword = (pw) => typeof pw === 'string' && [...pw].length >= 12 && [...pw].length <= 128 && encoder.encode(pw).length <= 1024;
export const validName = (name) => typeof name === 'string' && [...name].length <= 80 && !/[\x00-\x08\x0b\x0c\x0e-\x1f]/.test(name);
export const cleanAnswer = (v) => String(v ?? '').normalize('NFKC').toLowerCase().trim().replace(/\s+/g, ' ').replace(/[’‘]/g, "'").replace(/с/g, 'c');

function base64url(bytes) {
  // Browser and Workers support btoa; Node tests use Buffer only as a fallback.
  const binary = Array.from(bytes, b => String.fromCharCode(b)).join('');
  if (typeof btoa === 'function') return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
  return Buffer.from(bytes).toString('base64url');
}
function hex(bytes) { return Array.from(bytes, b => b.toString(16).padStart(2, '0')).join(''); }
export async function sha256(value) {
  const bytes = await crypto.subtle.digest('SHA-256', encoder.encode(value));
  return hex(new Uint8Array(bytes));
}
export function newSalt() { return hex(crypto.getRandomValues(new Uint8Array(16))); }
export async function passwordHash(password, salt) {
  const key = await crypto.subtle.importKey('raw', encoder.encode(password), 'PBKDF2', false, ['deriveBits']);
  const saltBytes = new Uint8Array(salt.match(/.{2}/g).map(h => parseInt(h, 16)));
  const bits = await crypto.subtle.deriveBits({name: 'PBKDF2', salt: saltBytes, iterations: ITERATIONS, hash: 'SHA-256'}, key, 256);
  return hex(new Uint8Array(bits));
}
export function sameHex(a, b) {
  if (!a || !b || a.length !== b.length) return false;
  let equal = 0;
  for(let i=0;i<a.length;i++) equal |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return equal === 0;
}
export function grade(expected, actual) {
  const list = String(expected ?? '').split(/\s+ИЛИ\s+|\s+или\s+|\s*\/\s*/i).map(cleanAnswer);
  return !String(actual ?? '').trim() ? 'empty' : list.includes(cleanAnswer(actual)) ? 'correct' : 'wrong';
}
