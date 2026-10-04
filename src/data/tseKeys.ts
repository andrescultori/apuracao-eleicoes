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
 * O `JsonWebKey` do lib.dom.d.ts não declara `kid` (não é usado pelo
 * WebCrypto na importação) — mas o valor publicado pelo TSE inclui o campo, e
 * é o mesmo texto usado aqui como `kid` de nível superior (conferido contra o
 * header do `.jws` em `verifyJws`/`expectedKid`). Por isso o tipo do JWK é
 * estendido só para aceitar esse campo extra, sem afetar o WebCrypto.
 */
type TseJsonWebKey = JsonWebKey & { kid: string };

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

const importedKeyCache = new Map<TseEnvKey, Promise<CryptoKey>>();

/**
 * Importa (e cacheia) a chave pública de verificação do ambiente informado.
 * `key_ops`/`use` do JWK vêm restritos a "verify" — importante passar
 * `usages: ['verify']` (nunca `['sign']`) para o Web Crypto aceitar o JWK tal
 * como publicado. Importada como `extractable: true` — não é um segredo (é a
 * chave PÚBLICA), e `jws.ts` precisa exportar os bytes brutos dela para
 * verificar a assinatura Ed25519 fora do Web Crypto (ver nota em jws.ts).
 */
export function getTseVerificationKey(env: TseEnvKey): { kid: string; keyPromise: Promise<CryptoKey> } {
  const config = TSE_JWS_KEYS[env];
  let keyPromise = importedKeyCache.get(env);
  if (!keyPromise) {
    keyPromise = crypto.subtle.importKey('jwk', config.jwk, { name: 'Ed25519' }, true, ['verify']);
    importedKeyCache.set(env, keyPromise);
  }
  return { kid: config.kid, keyPromise };
}
