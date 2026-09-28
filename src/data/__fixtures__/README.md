# Fixtures de teste

- `ea11.sample.json` é o catálogo real do simulado do TSE (gerado em
  14/09/2026), já decodificado do envelope `.jws` — payload real, não um
  exemplo reconstruído. Os códigos de eleição/cargo/ciclo são os observados
  ao vivo (ver notas de fonte em `ea11.ts`/`tseConfig.ts`).
- `ea20.sample.json` é uma versão reduzida (2 candidatos) de um arquivo real
  do simulado do TSE observado ao vivo em 28/09/2026
  (`br-c0001-e021270-u.jws`, Presidente/Brasil) — os nomes de candidato/partido
  já vêm fictícios do próprio ambiente de simulado do TSE ("CANDIDATO 9987"
  etc.), então não há nenhum dado real de votação aqui, mas o formato dos
  campos (strings, percentual com vírgula decimal, `v` no nível raiz) é real.

Nenhum desses arquivos contém dados reais de eleição em andamento. Servem
apenas para testar o parsing (`ea11.ts`, `tseDataProvider.ts`) de forma
determinística e isolada da rede.

## `real/` (opcional, não versionado)

`tseRealFixtures.test.ts` procura, nesta pasta, os arquivos `.jws` originais
(ainda com o envelope de assinatura, não decodificados) baixados via `curl`
diretamente do TSE:

- `real/ele-c.jws` — catálogo EA11 do simulado.
- `real/br-c0001-e021270-u.jws` — resultado unificado (Presidente/Brasil).

Se os arquivos não existirem, o teste é pulado (não falha) — servem para
validar, quando disponíveis, que a assinatura EdDSA real confere com a chave
de simulado (`tseKeys.ts`) e falha com a chave oficial. Nunca baixados
automaticamente por este projeto (ver "Modo de trabalho" no histórico do
PR) — quem os coloca aqui é o desenvolvedor, manualmente.
