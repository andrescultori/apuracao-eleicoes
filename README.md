# Apuração 2026

Painel de acompanhamento dos resultados eleitorais de 2026 — Presidente,
Governador, Senador, Deputado Federal e Deputado Estadual — com filtros de
turno, estado e candidato, favoritos, gráficos de distribuição e evolução da
apuração, tema claro/escuro e atualização automática configurável.

> ⚠ **Projeto independente.** O "Apuração 2026" não é afiliado ao Tribunal
> Superior Eleitoral (TSE) nem a qualquer órgão oficial. É uma interface de
> visualização de dados públicos, sem qualquer análise política, previsão
> eleitoral ou recomendação de voto.

## Como rodar localmente

```bash
npm install
npm run dev
```

Outros scripts disponíveis:

```bash
npm run build          # build de produção em dist/
npm run preview        # serve o build de produção localmente
npm run test           # testes unitários (Vitest)
npm run lint           # ESLint
npm run typecheck      # TypeScript em modo estrito, sem emitir arquivos
npm run format         # formata o projeto com Prettier
npm run format:check   # verifica formatação sem alterar arquivos
```

## Modos de dados

O app tem dois modos, alternáveis em **Configurações**:

- **Demonstração** (padrão): dados fictícios, gerados de forma determinística
  no navegador, simulando uma apuração ao longo do tempo. É o modo usado fora
  dos períodos oficiais de divulgação, e o fallback caso a integração real
  falhe — o app nunca fica quebrado ou vazio.
- **Dados oficiais (TSE)**: consome os arquivos públicos de divulgação de
  resultados do TSE. **Só existem dados reais para consumir durante os
  períodos oficiais de simulado (15–17/set, 22–24/set e 28–29/set de 2026) e
  no dia da eleição** — fora desses períodos, mesmo com o modo oficial
  selecionado, não há o que buscar.

### Estado atual da integração com o TSE

A integração real busca e interpreta o catálogo de eleições do TSE (arquivo
EA11) para resolver dinamicamente o código de eleição de cada cargo/UF —
nunca usa um código fixo. Isso já funciona de ponta a ponta (fila de
requisições com concorrência 1, cache com `ETag`/`If-None-Match`, backoff
exponencial em falha de rede, nunca repetir uma URL que respondeu 404).

O que **ainda não é possível concluir**, documentado como TODO explícito no
código (`src/data/tseConfig.ts`, `src/data/tseDataProvider.ts`) e nunca
contornado com valores inventados:

- **Código de cargo do TSE** por Presidente/Governador/Senador/Deputado
  Federal/Deputado Estadual, necessário para montar a URL do arquivo de
  resultado (EA10/EA20). Sem ele, o modo "Dados oficiais" mostra honestamente
  "Dados indisponíveis" em vez de arriscar uma URL incorreta.
- **Mecanismo de verificação de integridade dos arquivos.** O TSE cita um
  certificado digital (`cert-e<ELEICAO>-a.cer`) associado a cada eleição, mas
  não encontramos, nas fontes consultadas, confirmação de que os arquivos
  JSON de resultado venham como um envelope JWS assinado (nome citado na
  especificação original deste projeto) — pode ser um mecanismo baseado em
  certificado X.509 diferente, ou o material relevante pode estar em uma
  página que não pôde ser acessada nesta sessão de desenvolvimento (o domínio
  `tse.jus.br` estava bloqueado pela política de rede do ambiente usado).
  Enquanto isso não for confirmado, nenhum dado é promovido a "pronto" — ver
  `src/data/jws.ts`, que já implementa e testa a verificação de assinatura
  JWS de forma genérica, pronta para ser ligada assim que o mecanismo real
  for confirmado.

Essa pesquisa foi feita por fontes secundárias verificáveis (texto extraído
dos PDFs oficiais de especificação e amostras de JSON reais, publicados em
repositórios públicos), já que o acesso direto a `tse.jus.br` não estava
disponível no ambiente de desenvolvimento. **Antes de usar isto em uma eleição
real**, confirme os pontos acima diretamente na documentação oficial:

- [Informações técnicas sobre a divulgação de resultados](https://www.tse.jus.br/eleicoes/informacoes-tecnicas-sobre-a-divulgacao-de-resultados)

## Arquitetura

```
src/
  data/            # domínio, tipos, provedores de dados (mock e TSE)
  state/           # estado da aplicação, persistência, contexto compartilhado
  ui/               # um módulo por componente de interface
  styles/          # CSS (temas claro/escuro via custom properties)
  main.ts          # bootstrap
```

Os dois provedores de dados (`mockDataProvider` e `tseDataProvider`)
implementam a mesma interface `DataProvider` (`getElectionData`,
`getCandidates`, `getResults`, `getLastUpdate`) — a interface nunca sabe de
onde os dados vieram.

## CI/CD

- **GitHub Actions** (`.github/workflows/ci.yml`): roda formatação, lint,
  typecheck, testes e build em cada push/PR para `main`.
- **Deploy**: configurado para Netlify via `netlify.toml` (`npm run build`,
  publica `dist/`). Não são necessárias variáveis de ambiente secretas — os
  arquivos de divulgação do TSE são públicos e não exigem autenticação
  (segundo as fontes consultadas; não confirmado de forma explícita e
  documental — ver seção acima).

## Licença

MIT — ver [LICENSE](LICENSE).

---

Desenvolvido por [André Scultori](https://github.com/andrescultori) · © 2026 · [GitHub](https://github.com/andrescultori/apuracao-eleicoes)
