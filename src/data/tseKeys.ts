import type { TseEnvKey } from './tseConfig';

/**
 * Chaves públicas de verificação JWS do TSE, uma por ambiente.
 *
 * CONFIRMADO em 29/09/2026, via "Manual de verificação dos arquivos JWS" do
 * TSE (Apêndice A = desenvolvimento, Apêndice B = oficial — páginas 5–11 lidas
 * nesta sessão) e validado ao vivo: a assinatura de 3 arquivos reais do
 * simulado confere com a chave de simulado/desenvolvimento abaixo, e falha
 * com a chave oficial (como esperado — são ambientes/chaves diferentes).
 *
 * O manual não menciona rotação de chave nem um endpoint JWKS — a chave é
 * fixa por ambiente e nunca deve ser obtida de dentro do próprio `.jws` que
 * está sendo verificado (isso anularia a verificação). Por isso ela fica
 * hardcoded aqui, não buscada em tempo de execução.
 *
 * A chave oficial ainda não foi validada contra um arquivo oficial real (a
 * produção só abre com o pleito 3220, em 04/10/2026) — só a mecânica de
 * verificação foi testada (chave errada é rejeitada, ver jws.test.ts).
 */
/**
 * Forma do JWK publicado pelo TSE — só os campos que este módulo realmente
 * usa (`x`, a chave pública em base64url). Os demais (`kty`/`use`/`key_ops`/
 * `alg`/`crv`) ficam documentados abaixo tal como publicados, mas não
 * tipados à parte: o JWK nunca mais passa pelo Web Crypto (ver nota em
 * `getTseVerificationKey`), então não há motivo pra usar o tipo `JsonWebKey`
 * do lib.dom.d.ts aqui.
 */
interface TseJsonWebKey {
  kty: string;
  use: string;
  key_ops: string[];
  alg: string;
  kid: string;
  crv: string;
  x: string;
}

export const TSE_JWS_KEYS: Record<TseEnvKey, { kid: string; jwk: TseJsonWebKey }> = {
  simulado: {
    kid: 'pEGrlis0i8vO2Bz7Ergwr0MnKfg',
    jwk: {
      kty: 'OKP',
      use: 'sig',
      key_ops: ['verify'],
      alg: 'EdDSA',
      kid: 'pEGrlis0i8vO2Bz7Ergwr0MnKfg',
      crv: 'Ed25519',
      x: '81fm_gXW6Q5gBWrGJkE7j5MOS5vmTnRqqFHfdMeRbsw',
    },
  },
  oficial: {
    kid: 'sNbt9Q_fLS65zE1_ZLNV-XRRwPY',
    jwk: {
      kty: 'OKP',
      use: 'sig',
      key_ops: ['verify'],
      alg: 'EdDSA',
      kid: 'sNbt9Q_fLS65zE1_ZLNV-XRRwPY',
      crv: 'Ed25519',
      x: 'kWlpNHjuws1csyQZwzn3Fhzbi3RD435RbpThtSr4hMc',
    },
  },
};

/**
 * Decodifica o campo `x` do JWK (base64url) para os 32 bytes brutos da chave
 * pública Ed25519 — sem passar pelo Web Crypto (`crypto.subtle.importKey`).
 *
 * Isso não é só por simetria com a verificação em `jws.ts` (que já usa
 * `@noble/curves`, não `crypto.subtle.verify`, por causa de um bug do WebKit
 * na implementação de Ed25519 — ver nota lá): um usuário real reportou que,
 * mesmo depois de trocar só a verificação, "Dados oficiais" continuava
 * indisponível no iPhone dele. A suspeita é que o mesmo tipo de bug também
 * afeta `importKey`/`exportKey` para Ed25519 no WebKit, não só `verify` — ou
 * seja, qualquer uso do Web Crypto para essa curva é suspeito. Por isso a
 * chave pública nunca mais passa pelo Web Crypto: decodificada aqui como
 * bytes brutos, direto do JWK, e usada assim por `@noble/curves` de ponta a
 * ponta.
 */
function base64UrlToBytes(b64url: string): Uint8Array {
  const b64 = b64url.replace(/-/g, '+').replace(/_/g, '/');
  const padded = b64 + '='.repeat((4 - (b64.length % 4)) % 4);
  const binary = atob(padded);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

/** Devolve o `kid` e os bytes brutos da chave pública de verificação do ambiente informado. */
export function getTseVerificationKey(env: TseEnvKey): { kid: string; rawPublicKey: Uint8Array } {
  const config = TSE_JWS_KEYS[env];
  return { kid: config.kid, rawPublicKey: base64UrlToBytes(config.jwk.x) };
}
