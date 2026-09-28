/**
 * Verificação de assinatura JWS (JSON Web Signature) para os arquivos de
 * divulgação de resultados do TSE.
 *
 * CONFIRMADO ao vivo em 28/09/2026 (navegação manual pelo app oficial do
 * simulado, durante a janela de simulado de 28–29/set, com leitura do
 * `performance.getEntriesByType('resource')` do navegador e fetch pontual dos
 * arquivos já carregados pelo app — ver PR que introduziu esta nota):
 *   - Os arquivos de resultado (`-u.jws`, `-e.jws`, etc.) são de fato um JWS em
 *     compact serialization (3 blocos separados por ponto).
 *   - Algoritmo: **EdDSA (Ed25519)** — não RS256/ES256 como se cogitava antes.
 *     Header observado: `{"alg":"EdDSA","kid":"pEGrlis0i8vO2Bz7Ergwr0MnKfg","typ":"JOSE"}`.
 *   - Assinatura de 64 bytes, consistente com Ed25519.
 *   - Manual oficial: "Manual de verificação dos arquivos JWS" —
 *     https://www.tse.jus.br/eleicoes/eleicoes-2026-content/arquivos/divulgacao-de-resultados/manual-verificacao-jws
 *     (PDF de 11 páginas; só as páginas 1–4 foram lidas até agora). Publica a
 *     chave pública em dois formatos (mesma chave Ed25519): JWK (indicado para
 *     JS/Python) e X.509 (cadeia AC TOTALIZACAO → AC DIVULGACAO → ELEICOES 2026,
 *     com LCR). Bibliotecas citadas: `jose` (Node), `python-jose`/`cryptography`
 *     (Python), `nimbus-jose-jwt` (Java), `firebase/php-jwt` (PHP),
 *     `Microsoft.IdentityModel.Tokens` (.NET).
 *
 * NÃO CONFIRMADO — ainda falta a chave pública real para verificar de fato:
 *   - O Apêndice A do manual (lido) traz chaves de **DESENVOLVIMENTO**,
 *     explicitamente marcadas "não válidas para resultados oficiais". Deve
 *     haver um apêndice equivalente para produção nas páginas 5–11, ainda não
 *     lidas.
 *   - Por isso `tseDataProvider.ts` continua sem chamar `verifyJws` de verdade
 *     — sem a chave real (JWK do TSE, importada via
 *     `crypto.subtle.importKey('jwk', jwk, {name:'Ed25519'}, false, ['verify'])`),
 *     não há nada a verificar contra, e nenhum dado deve ser promovido a
 *     "ready" nessa condição. Ver TODO em tseDataProvider.ts.
 *
 * O que ESTE módulo faz, de forma genérica e sem depender de qual chave será
 * usada:
 *  - decodifica um JWS em "compact serialization" (header.payload.signature);
 *  - localiza o algoritmo declarado no header (`alg`);
 *  - verifica a assinatura via Web Crypto (SubtleCrypto), a partir de uma
 *    CryptoKey pública fornecida pelo chamador (ver `TODO(tse-integracao)`
 *    em tseConfig.ts para como obter essa chave a partir da documentação real);
 *  - só devolve o payload decodificado quando a assinatura é válida.
 *
 * Nunca aceitar um payload cuja assinatura não verifique — nesse caso o
 * chamador deve tratar como "dados indisponíveis", nunca exibir como oficial.
 */

export interface DecodedJws {
  header: Record<string, unknown>;
  payload: unknown;
}

export class JwsVerificationError extends Error {}

function base64UrlToUint8Array(b64url: string): Uint8Array {
  const b64 = b64url.replace(/-/g, '+').replace(/_/g, '/');
  const padded = b64 + '='.repeat((4 - (b64.length % 4)) % 4);
  const binary = atob(padded);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

function base64UrlDecodeToString(b64url: string): string {
  return new TextDecoder().decode(base64UrlToUint8Array(b64url));
}

const ALG_TO_SUBTLE: Record<string, { name: string; hash?: string }> = {
  EdDSA: { name: 'Ed25519' },
  RS256: { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' },
  RS384: { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-384' },
  RS512: { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-512' },
  PS256: { name: 'RSA-PSS', hash: 'SHA-256' },
  ES256: { name: 'ECDSA', hash: 'SHA-256' },
  ES384: { name: 'ECDSA', hash: 'SHA-384' },
};

/**
 * Verifica um JWS em compact serialization ("header.payload.signature") contra
 * uma chave pública já importada. Lança `JwsVerificationError` para qualquer
 * formato inválido ou assinatura que não confira — nunca retorna um payload
 * não verificado.
 */
export async function verifyJws(compact: string, publicKey: CryptoKey): Promise<DecodedJws> {
  const parts = compact.split('.');
  if (parts.length !== 3) {
    throw new JwsVerificationError('Formato JWS inválido: esperado header.payload.signature');
  }
  const [headerB64, payloadB64, signatureB64] = parts as [string, string, string];

  let header: Record<string, unknown>;
  try {
    header = JSON.parse(base64UrlDecodeToString(headerB64)) as Record<string, unknown>;
  } catch {
    throw new JwsVerificationError('Header JWS não é um JSON válido');
  }

  const alg = header['alg'];
  if (typeof alg !== 'string' || !ALG_TO_SUBTLE[alg]) {
    throw new JwsVerificationError(`Algoritmo JWS não suportado: ${String(alg)}`);
  }
  const algSpec = ALG_TO_SUBTLE[alg]!;

  const signingInput = new TextEncoder().encode(`${headerB64}.${payloadB64}`);
  const signature = base64UrlToUint8Array(signatureB64);

  const verifyAlgorithm: AlgorithmIdentifier | RsaPssParams | EcdsaParams =
    algSpec.name === 'RSA-PSS'
      ? { name: 'RSA-PSS', saltLength: 32 }
      : algSpec.name === 'ECDSA'
        ? { name: 'ECDSA', hash: algSpec.hash! }
        : { name: algSpec.name }; // Ed25519 (EdDSA) e RSASSA-PKCS1-v1_5 não levam parâmetro de hash aqui

  const valid = await crypto.subtle.verify(
    verifyAlgorithm,
    publicKey,
    signature as BufferSource,
    signingInput as BufferSource,
  );
  if (!valid) {
    throw new JwsVerificationError('Assinatura JWS inválida — payload rejeitado');
  }

  let payload: unknown;
  try {
    payload = JSON.parse(base64UrlDecodeToString(payloadB64));
  } catch {
    throw new JwsVerificationError('Payload JWS não é um JSON válido');
  }

  return { header, payload };
}
