import { beforeAll, describe, expect, it } from 'vitest';
import { JwsVerificationError, verifyJws } from './jws';

function base64UrlEncode(bytes: Uint8Array): string {
  let binary = '';
  for (const b of bytes) binary += String.fromCharCode(b);
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function base64UrlEncodeString(s: string): string {
  return base64UrlEncode(new TextEncoder().encode(s));
}

async function signCompactJws(payload: unknown, privateKey: CryptoKey): Promise<string> {
  const header = { alg: 'RS256', typ: 'JWT' };
  const headerB64 = base64UrlEncodeString(JSON.stringify(header));
  const payloadB64 = base64UrlEncodeString(JSON.stringify(payload));
  const signingInput = new TextEncoder().encode(`${headerB64}.${payloadB64}`);
  const signature = await crypto.subtle.sign({ name: 'RSASSA-PKCS1-v1_5' }, privateKey, signingInput);
  const signatureB64 = base64UrlEncode(new Uint8Array(signature));
  return `${headerB64}.${payloadB64}.${signatureB64}`;
}

describe('verifyJws', () => {
  let publicKey: CryptoKey;
  let privateKey: CryptoKey;
  let otherPublicKey: CryptoKey;

  beforeAll(async () => {
    const keyPair = await crypto.subtle.generateKey(
      { name: 'RSASSA-PKCS1-v1_5', modulusLength: 2048, publicExponent: new Uint8Array([1, 0, 1]), hash: 'SHA-256' },
      false,
      ['sign', 'verify'],
    );
    publicKey = keyPair.publicKey;
    privateKey = keyPair.privateKey;

    const otherPair = await crypto.subtle.generateKey(
      { name: 'RSASSA-PKCS1-v1_5', modulusLength: 2048, publicExponent: new Uint8Array([1, 0, 1]), hash: 'SHA-256' },
      false,
      ['sign', 'verify'],
    );
    otherPublicKey = otherPair.publicKey;
  });

  it('aceita um JWS corretamente assinado e devolve o payload decodificado', async () => {
    const compact = await signCompactJws({ resultado: 'ok', votos: 123 }, privateKey);
    const decoded = await verifyJws(compact, publicKey);
    expect(decoded.payload).toEqual({ resultado: 'ok', votos: 123 });
    expect(decoded.header['alg']).toBe('RS256');
  });

  it('rejeita um payload adulterado depois da assinatura', async () => {
    const compact = await signCompactJws({ resultado: 'ok', votos: 123 }, privateKey);
    const [headerB64, , signatureB64] = compact.split('.');
    const tamperedPayloadB64 = base64UrlEncodeString(JSON.stringify({ resultado: 'ok', votos: 999999 }));
    const tampered = `${headerB64}.${tamperedPayloadB64}.${signatureB64}`;

    await expect(verifyJws(tampered, publicKey)).rejects.toThrow(JwsVerificationError);
  });

  it('rejeita quando verificado com a chave pública errada', async () => {
    const compact = await signCompactJws({ resultado: 'ok' }, privateKey);
    await expect(verifyJws(compact, otherPublicKey)).rejects.toThrow(JwsVerificationError);
  });

  it('rejeita um formato inválido (sem 3 partes)', async () => {
    await expect(verifyJws('nao.eh.um.jws.valido', publicKey)).rejects.toThrow(JwsVerificationError);
    await expect(verifyJws('sopartes', publicKey)).rejects.toThrow(JwsVerificationError);
  });

  it('rejeita um algoritmo não suportado no header', async () => {
    const header = base64UrlEncodeString(JSON.stringify({ alg: 'none' }));
    const payload = base64UrlEncodeString(JSON.stringify({ a: 1 }));
    await expect(verifyJws(`${header}.${payload}.x`, publicKey)).rejects.toThrow(JwsVerificationError);
  });
});
