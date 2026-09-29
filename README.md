🇧🇷 Português | [🇺🇸 English](README.en.md)

# 🗳️ Apuração 2026

**Acompanhamento de resultados eleitorais em tempo real — 5 cargos, candidatos favoritos entre estados, e uma integração real (não simulada) com a divulgação oficial do TSE.**

Dashboard client-side (TypeScript + Vite, sem framework) que simula a apuração de votos por padrão e já busca/interpreta o catálogo de eleições real do TSE quando ligado ao modo oficial — sem nunca misturar dado fictício com dado real na mesma tela.

**[🔗 Ver demo ao vivo](https://andrescultori.github.io/apuracao-eleicoes/)** — sem senha; o modo padrão usa dados fictícios, então não há nada sensível a proteger.

> ⚠ **Projeto independente.** O "Apuração 2026" não é afiliado ao Tribunal
> Superior Eleitoral (TSE) nem a qualquer órgão oficial. É uma interface de
> visualização de dados públicos, sem qualquer análise política, previsão
> eleitoral ou recomendação de voto.

![Painel do Apuração 2026 mostrando a apuração de Presidente, com um candidato favoritado em destaque](screenshots/apuracao-2026-presidente.png)

## Contexto

Acompanhar uma apuração eleitoral espalhada em 5 corridas diferentes (Presidente, Governador, Senador, Deputado Federal, Deputado Estadual) é desconfortável: os candidatos que interessam a cada eleitor muitas vezes estão em estados diferentes, e a maioria dos painéis de acompanhamento só mostra uma corrida de cada vez. Este projeto nasceu para resolver dois problemas ao mesmo tempo: reunir os 5 cargos num só lugar, e deixar favoritar um candidato de qualquer estado sem perder o fio da meada.

## A solução

```
Fonte de dados
  ├─ Modo Demonstração → gerador determinístico (seed fixa, simula a contagem ao longo do tempo)
  └─ Modo TSE          → catálogo EA11 (real) → resolve cargo/UF/turno → EA10/EA20
        ↓
  DataProvider (interface única — a UI nunca sabe de onde o número veio)
        ↓
  Estado da aplicação (filtros, favoritos entre cargos/UFs, tema)
        ↓
  Renderização (tabela, gráficos, barra de favoritos no topo)
```

Trocar a fonte de dados é uma linha de configuração em "Configurações" — a interface, a busca de favoritos e os gráficos continuam funcionando exatamente iguais nos dois modos.

## O painel em si

- Os 5 cargos (Presidente, Governador, Senador, Deputado Federal, Deputado Estadual), com abrangência nacional ou por UF conforme o cargo.
- Filtros de turno (1º/2º — 2º turno só onde há segundo turno), estado e busca de candidato.
- **Candidatos Favoritos**: busca por nome ou número em qualquer cargo/UF (não só na corrida aberta no momento), favoritos em destaque nas tabelas e gráficos, e uma barra fixa no topo da página com a posição/percentual atual de cada um.
- Gráfico de distribuição de votos e gráfico de evolução da apuração ao longo do tempo.
- Tema claro/escuro/sistema, layout responsivo, atualização automática configurável (10s a 2min).

### Modos de dados

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

## Stack técnica

| Camada                 | Tecnologia                                                         |
| ---------------------- | ------------------------------------------------------------------ |
| Build / dev server     | [Vite](https://vitejs.dev)                                         |
| Linguagem              | TypeScript, modo `strict`                                          |
| UI                     | HTML/CSS/JS puro — sem framework, um módulo por componente         |
| Testes                 | [Vitest](https://vitest.dev) (66 testes)                           |
| Lint / formatação      | ESLint 9 + typescript-eslint, Prettier                             |
| CI                     | GitHub Actions                                                     |
| Deploy                 | GitHub Pages (via Actions) + Netlify (configuração pronta)         |
| Fonte de dados oficial | TSE — catálogo EA11, resultado EA10/EA20, acompanhamento EA14/EA15 |

## Decisão técnica: integração real com o TSE

A integração real busca e interpreta o catálogo de eleições do TSE (arquivo
EA11) para resolver dinamicamente o código de eleição de cada cargo/UF —
nunca usa um código fixo — e monta a URL de cada arquivo a partir do
_template_ de diretório publicado pelo próprio catálogo (`arq[].dir`), nunca
de um caminho fixado no código. Fila de requisições com concorrência 1,
cache com `ETag`/`If-None-Match`, backoff exponencial em falha de rede,
nunca repetir uma URL que respondeu 404.

Confirmado ao vivo, com acesso real ao navegador durante as janelas de
simulado de setembro/2026 e testado nesta própria interface (Presidente,
Governador, Senador, Deputado Federal e Deputado Estadual, em vários
estados, com atualização automática e sem intervenção manual):

- **Código de cargo do TSE** — Presidente `0001`, Governador `0003`, Senador
  `0005`, Deputado Federal `0006`, Deputado Estadual `0007`
  (`TSE_CONFIG.officeCargoCode`), confirmado também no próprio catálogo
  (`cp[].cd`).
- **Verificação de assinatura ligada de ponta a ponta** — os arquivos vêm
  como um envelope JWS (EdDSA/Ed25519); as duas chaves públicas publicadas
  pelo TSE (desenvolvimento/simulado e produção/oficial) já estão embutidas
  em `src/data/tseKeys.ts`. Nenhum dado é aceito sem assinatura válida,
  algoritmo esperado (`EdDSA`) e `kid` batendo com o ambiente ativo — um
  arquivo adulterado, de outro ambiente, ou ainda não publicado nunca é
  promovido a "pronto".
- **Seções totalizadas** — vem do arquivo de acompanhamento do TSE (tipo de
  arquivo "ab", EA14/EA15), confirmado ao vivo em 29/09/2026 a partir de um
  arquivo real do simulado: um único arquivo Brasil-scoped já traz as 27 UFs
  (mais o exterior), sem precisar buscar um arquivo por UF.
- **CORS** — acesso direto do navegador ao domínio do TSE, sem bloqueio;
  não há proxy nem função serverless no meio, e não é preciso ter.
- **Base de percentual configurável** — em "Configurações" é possível
  escolher se o percentual de cada candidato é calculado sobre votos válidos
  (padrão, exclui brancos/nulos) ou sobre votos totais apurados.

O que **ainda não foi confirmado ao vivo**, documentado explicitamente no
código e nunca contornado com valores inventados:

- **O ambiente oficial** (`resultados.tse.jus.br/oficial`). A chave pública
  de produção já está embutida e a mecânica de verificação foi testada
  (rejeita a chave errada), mas o ambiente só abre com o pleito 3220, em
  04/10/2026 — ainda sem candidatos definidos.
- **Nível UF isolado** (sem município) para o arquivo de resultado — só o
  nível município foi observado ao vivo diretamente; o app sempre resolve a
  partir do _template_ do catálogo, então nunca inventa esse padrão.
- **2º turno** — usa o mesmo código de eleição de 2º turno (`cdt2`)
  publicado pelo catálogo, mas ainda não foi testado contra dados reais de
  2º turno.
- **Tratamento de voto anulado por candidato** (`dvt`) — hoje todo candidato
  aparece na lista de resultados independente desse campo; a opção de base
  de percentual resolve o total agregado, mas não filtra linhas individuais.

**Antes de usar isto em uma eleição real**, confirme os pontos acima
diretamente na documentação oficial:

- [Informações técnicas sobre a divulgação de resultados](https://www.tse.jus.br/eleicoes/informacoes-tecnicas-sobre-a-divulgacao-de-resultados)
- [Manual de verificação dos arquivos JWS](https://www.tse.jus.br/eleicoes/eleicoes-2026-content/arquivos/divulgacao-de-resultados/manual-verificacao-jws)

## Arquitetura

```
src/
  data/            # domínio, tipos, provedores de dados (mock e TSE)
  state/           # estado da aplicação, persistência, contexto compartilhado
  ui/              # um módulo por componente de interface
  styles/          # CSS (temas claro/escuro via custom properties)
  main.ts          # bootstrap
```

Os dois provedores de dados ([`mockDataProvider`](src/data/mockDataProvider.ts) e
[`tseDataProvider`](src/data/tseDataProvider.ts)) implementam a mesma interface
[`DataProvider`](src/data/types.ts) (`getElectionData`, `getCandidates`,
`getResults`, `getLastUpdate`) — a interface nunca sabe de onde os dados
vieram. O contexto compartilhado ([`AppContext`](src/state/appContext.ts))
decide qual provedor consultar a cada chamada, e a busca de favoritos entre
cargos/UFs ([`candidateSearch.ts`](src/state/candidateSearch.ts)) usa esse
mesmo dispatcher.

## CI/CD

- **GitHub Actions** (`.github/workflows/ci.yml`): roda formatação, lint,
  typecheck, testes e build em cada push/PR para `main`.
- **Deploy no GitHub Pages** (padrão): workflow
  `.github/workflows/deploy-pages.yml`, builda com `BASE_PATH=/apuracao-eleicoes/`
  (necessário porque uma página de projeto do GitHub Pages é servida em
  `usuario.github.io/repositorio/`, não na raiz do domínio) e publica via
  Actions a cada push em `main`.
- **Deploy no Netlify** (alternativa, configuração pronta): via `netlify.toml`
  (`npm run build`, publica `dist/`). Não são necessárias variáveis de
  ambiente secretas — os arquivos de divulgação do TSE são públicos e não
  exigem autenticação nem proxy, confirmado nas buscas reais feitas por esta
  interface durante os simulados (ver seção acima).

## Rodando localmente

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

## Licença

MIT — ver [LICENSE](LICENSE).

---

_Os dados exibidos no modo Demonstração são inteiramente fictícios, gerados de forma determinística no navegador — nenhum dado real de votação é usado, coletado ou armazenado por este projeto._

Desenvolvido por [André Scultori](https://github.com/andrescultori) · © 2026 · [GitHub](https://github.com/andrescultori/apuracao-eleicoes)
