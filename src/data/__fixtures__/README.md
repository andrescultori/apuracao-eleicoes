# Fixtures de teste

- `ea11.sample.json` é um exemplo ilustrativo, com a forma de catálogo
  reconstruída a partir da pesquisa documentada em `tseConfig.ts`.
- `ea20.sample.json` é uma versão reduzida (2 candidatos) de um arquivo real
  do simulado do TSE observado ao vivo em 28/09/2026
  (`br-c0001-e021270-u.jws`, Presidente/Brasil) — os nomes de candidato/partido
  já vêm fictícios do próprio ambiente de simulado do TSE ("CANDIDATO 9987"
  etc.), então não há nenhum dado real de votação aqui, mas o formato dos
  campos (strings, percentual com vírgula decimal, `v` no nível raiz) é real.

Nenhum desses arquivos contém dados reais de eleição em andamento. Servem
apenas para testar o parsing (`ea11.ts`, `tseDataProvider.ts`) de forma
determinística e isolada da rede.
