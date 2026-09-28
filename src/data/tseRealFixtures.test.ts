import { describe, expect, it } from 'vitest';
import { verifyJws } from './jws';
import { getTseVerificationKey } from './tseKeys';

/**
 * Testes opcionais contra arquivos `.jws` REAIS do TSE, ainda com o envelope
 * de assinatura original — nunca baixados por este projeto (ver
 * src/data/__fixtures__/README.md). `import.meta.glob` (recurso do próprio
 * Vite, já usado neste projeto — sem depender de `node:fs`, que não tem
 * tipos instalados aqui) devolve um objeto vazio quando os arquivos não
 * existem, então os testes são pulados (não falham) nesse caso.
 */
const realFixtures = import.meta.glob('./__fixtures__/real/*.jws', {
  eager: true,
  query: '?raw',
  import: 'default',
}) as Record<string, string>;

function findFixture(filename: string): string | null {
  for (const [path, content] of Object.entries(realFixtures)) {
    if (path.endsWith(`/${filename}`)) return content.trim();
  }
  return null;
}

const catalogJws = findFixture('ele-c.jws');
const resultJws = findFixture('br-c0001-e021270-u.jws');

describe.skipIf(catalogJws === null)('catálogo EA11 real (real/ele-c.jws)', () => {
  it('assinatura confere com a chave de simulado', async () => {
    const { kid, keyPromise } = getTseVerificationKey('simulado');
    const key = await keyPromise;
    await expect(
      verifyJws(catalogJws as string, key, { allowedAlgs: ['EdDSA'], expectedKid: kid }),
    ).resolves.toBeDefined();
  });

  it('assinatura NÃO confere com a chave oficial (ambiente diferente)', async () => {
    const { kid, keyPromise } = getTseVerificationKey('oficial');
    const key = await keyPromise;
    await expect(verifyJws(catalogJws as string, key, { allowedAlgs: ['EdDSA'], expectedKid: kid })).rejects.toThrow();
  });
});

describe.skipIf(resultJws === null)('resultado EA20 real (real/br-c0001-e021270-u.jws)', () => {
  it('assinatura confere com a chave de simulado', async () => {
    const { kid, keyPromise } = getTseVerificationKey('simulado');
    const key = await keyPromise;
    await expect(
      verifyJws(resultJws as string, key, { allowedAlgs: ['EdDSA'], expectedKid: kid }),
    ).resolves.toBeDefined();
  });

  it('assinatura NÃO confere com a chave oficial (ambiente diferente)', async () => {
    const { kid, keyPromise } = getTseVerificationKey('oficial');
    const key = await keyPromise;
    await expect(verifyJws(resultJws as string, key, { allowedAlgs: ['EdDSA'], expectedKid: kid })).rejects.toThrow();
  });
});

if (catalogJws === null && resultJws === null) {
  console.warn(
    '[tseRealFixtures.test.ts] Fixtures reais ausentes em src/data/__fixtures__/real/ — testes pulados. ' +
      'Ver src/data/__fixtures__/README.md para como obtê-las (manualmente, nunca via automação).',
  );
}
