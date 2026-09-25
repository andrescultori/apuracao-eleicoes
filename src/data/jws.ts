/**
 * Verificação de assinatura JWS (JSON Web Signature) para os arquivos de
 * divulgação de resultados do TSE.
 *
 * NÃO CONFIRMADO — atualização após pesquisa: não localizamos, em nenhuma
 * fonte consultada (ver nota de fontes em tseConfig.ts), um "Manual de
 * verificação dos arquivos JWS" nem qualquer menção a JWS, RS256/ES256 ou
 * serialização compact para os arquivos EA10–EA20. O que encontramos foi um
 * arquivo tipo "a" no catálogo EA11 — `cert-e<ELEICAO>-a.cer` — descrito como
 * "certificado digital utilizado para validação da assinatura dos arquivos
 * gerados para uma eleição", o que sugere um mecanismo baseado em certificado
 * X.509 (possivelmente PKCS#7/CMS destacado) em vez de JWS — mas isso é
 * inferência nossa, não um fato confirmado. Também é possível que o manual
 * exista e não tenha sido encontrado por causa do bloqueio de rede ao domínio
 * tse.jus.br neste ambiente.
 *
 * Por isso este módulo continua disponível e testado (para o caso de a
 * integração real usar JWS em algum arquivo), mas `tseDataProvider.ts`
 * atualmente NÃO o usa como gate de confiança — ele documenta esse ponto em
 * aberto e nunca promove um resultado a "ready" sem essa confirmação. Não
 * decidir sozinho qual mecanismo usar em produção sem antes confirmar na
 * documentação oficial (a partir de um ambiente sem esse bloqueio de rede).
 *
 * O que ESTE módulo faz, de forma genérica e sem depender desses detalhes:
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
        : { name: algSpec.name };

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
