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
 * ATUALIZADO em 29/09/2026: as páginas 5–11 do manual (Apêndice B) foram
 * lidas e trazem a chave pública de PRODUÇÃO, validada ao vivo contra 3
 * arquivos reais do simulado (assinatura confere com a chave de
 * desenvolvimento; falha com a de produção, como esperado). As duas chaves
 * (dev/simulado e produção/oficial) ficam em `tseKeys.ts`, uma por ambiente,
 * fixas — o manual não menciona rotação nem JWKS, e é explícito que a chave
 * nunca deve ser lida de dentro do próprio `.jws` que está sendo verificado.
 * `tseDataProvider.ts` já liga essa verificação de ponta a ponta.
 *
 * O que ESTE módulo faz, de forma genérica e sem depender de qual chave será
 * usada:
 *  - decodifica um JWS em "compact serialization" (header.payload.signature);
 *  - localiza o algoritmo declarado no header (`alg`) e opcionalmente restringe
 *    a um conjunto permitido (`allowedAlgs`) e confere o `kid` esperado
 *    (`expectedKid`) — ver `VerifyJwsOptions`;
 *  - verifica a assinatura a partir de uma CryptoKey pública fornecida pelo
 *    chamador (ver `tseKeys.ts` para como o TSE resolve essa chave por
 *    ambiente);
 *  - só devolve o payload decodificado quando a assinatura é válida.
 *
 * Nunca aceitar um payload cuja assinatura não verifique — nesse caso o
 * chamador deve tratar como "dados indisponíveis", nunca exibir como oficial.
 *
 * EdDSA (Ed25519) — único algoritmo que o TSE usa de verdade — é verificado
 * com `@noble/curves` (implementação em JS puro, auditada), nunca com o Web
 * Crypto: reportado por um usuário real em 04/10/2026 que o modo "Dados
 * oficiais" nunca carregava no iPhone (iOS 26.6.1, Chrome e Firefox — ambos
 * rodam sobre o WebKit do Safari no iOS, então o motor é o mesmo), mesmo com
 * o mesmo app funcionando normalmente no desktop. Suporte a Ed25519 no Web
 * Crypto do Safari só chegou na versão 17 (set/2023), e há bug documentado do
 * WebKit na implementação de Ed25519 (webkit.org/b/262499) — ou seja, mesmo
 * num iOS atual, `crypto.subtle` para essa curva não é confiável.
 *
 * Uma primeira correção trocou só `crypto.subtle.verify` pelo `@noble/curves`,
 * mas manteve `crypto.subtle.exportKey('raw', ...)` para obter os bytes da
 * chave pública — e o problema persistiu no mesmo iPhone. Suspeita: o bug do
 * WebKit provavelmente afeta a curva Ed25519 como um todo no Web Crypto, não
 * só a operação de verificar. Por isso a chave pública nunca mais passa pelo
 * Web Crypto (nem `importKey`, nem `exportKey`): `tseKeys.ts` decodifica os
 * bytes brutos direto do campo `x` do JWK (base64url), e `verifyJws` recebe
 * esses bytes prontos — Ed25519 fica 100% em `@noble/curves`, de ponta a
 * ponta, sem nenhuma dependência do navegador. Os demais algoritmos (RS256
 * etc. — nunca usados pelo TSE, mantidos só pela genericidade do
 * verificador) continuam em `crypto.subtle.verify`, via `CryptoKey`.
 */

import { ed25519 } from '@noble/curves/ed25519.js';

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

export interface VerifyJwsOptions {
  /**
   * Restringe quais algoritmos são aceitos, além de precisarem estar em
   * `ALG_TO_SUBTLE`. Sem isso, qualquer algoritmo suportado passa — útil para
   * testar o "motor" genérico, mas o TSE só deve aceitar EdDSA (ver
   * tseDataProvider.ts, que chama com `allowedAlgs: ['EdDSA']`), evitando
   * ataques de confusão de algoritmo.
   */
  allowedAlgs?: string[];
  /**
   * Confere o `kid` do header contra o valor esperado (o `kid` da chave que o
   * chamador está usando para verificar). Sem isso, um JWS com `kid` de outro
   * ambiente/eleição passaria despercebido caso a chave verificasse por
   * coincidência de curva — nunca deve acontecer com Ed25519, mas a checagem
   * explícita é uma defesa em profundidade barata.
   */
  expectedKid?: string;
}

/**
 * Verifica um JWS em compact serialization ("header.payload.signature") contra
 * uma chave pública já importada. Lança `JwsVerificationError` para qualquer
 * formato inválido, algoritmo/kid não esperado, ou assinatura que não confira
 * — nunca retorna um payload não verificado.
 *
 * `publicKey` é `Uint8Array` (bytes brutos) para EdDSA — ver nota no topo do
 * arquivo sobre por que essa curva nunca passa pelo Web Crypto — ou
 * `CryptoKey` para os demais algoritmos (RS256 etc.).
 */
export async function verifyJws(
  compact: string,
  publicKey: CryptoKey | Uint8Array,
  options: VerifyJwsOptions = {},
): Promise<DecodedJws> {
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
  if (options.allowedAlgs && !options.allowedAlgs.includes(alg)) {
    throw new JwsVerificationError(`Algoritmo JWS não permitido neste contexto: ${alg}`);
  }
  if (options.expectedKid !== undefined && header['kid'] !== options.expectedKid) {
    throw new JwsVerificationError(`kid do JWS não confere com o esperado: ${String(header['kid'])}`);
  }
  const algSpec = ALG_TO_SUBTLE[alg]!;

  const signingInput = new TextEncoder().encode(`${headerB64}.${payloadB64}`);
  const signature = base64UrlToUint8Array(signatureB64);

  let valid: boolean;
  if (algSpec.name === 'Ed25519') {
    // Ver nota no topo do arquivo: Ed25519 nunca passa pelo Web Crypto (nem
    // import, nem export, nem verify) — o bug do WebKit é suspeito de afetar
    // a curva inteira, não só a verificação. `publicKey` já chega como bytes
    // brutos (ver `tseKeys.ts`).
    if (!(publicKey instanceof Uint8Array)) {
      throw new JwsVerificationError('Chave pública para EdDSA precisa ser bytes brutos (Uint8Array)');
    }
    try {
      valid = ed25519.verify(signature, signingInput, publicKey);
    } catch {
      valid = false;
    }
  } else {
    if (publicKey instanceof Uint8Array) {
      throw new JwsVerificationError(`Chave pública para ${alg} precisa ser uma CryptoKey`);
    }
    const verifyAlgorithm: AlgorithmIdentifier | RsaPssParams | EcdsaParams =
      algSpec.name === 'RSA-PSS'
        ? { name: 'RSA-PSS', saltLength: 32 }
        : algSpec.name === 'ECDSA'
          ? { name: 'ECDSA', hash: algSpec.hash! }
          : { name: algSpec.name }; // RSASSA-PKCS1-v1_5 não leva parâmetro de hash aqui
    valid = await crypto.subtle.verify(
      verifyAlgorithm,
      publicKey,
      signature as BufferSource,
      signingInput as BufferSource,
    );
  }
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
