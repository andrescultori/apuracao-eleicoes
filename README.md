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

| Camada                 | Tecnologia                                                 |
| ---------------------- | ---------------------------------------------------------- |
| Build / dev server     | [Vite](https://vitejs.dev)                                 |
| Linguagem              | TypeScript, modo `strict`                                  |
| UI                     | HTML/CSS/JS puro — sem framework, um módulo por componente |
| Testes                 | [Vitest](https://vitest.dev) (34 testes)                   |
| Lint / formatação      | ESLint 9 + typescript-eslint, Prettier                     |
| CI                     | GitHub Actions                                             |
| Deploy                 | GitHub Pages (via Actions) + Netlify (configuração pronta) |
| Fonte de dados oficial | TSE — catálogo EA11 + arquivos de resultado EA10/EA20      |

## Decisão técnica: integração real com o TSE

A integração real busca e interpreta o catálogo de eleições do TSE (arquivo
EA11) para resolver dinamicamente o código de eleição de cada cargo/UF —
nunca usa um código fixo. Isso já funciona de ponta a ponta (fila de
requisições com concorrência 1, cache com `ETag`/`If-None-Match`, backoff
exponencial em falha de rede, nunca repetir uma URL que respondeu 404).

Em 28/09/2026, dentro da janela oficial de simulado, uma sessão com acesso
real ao navegador (Claude in Chrome) navegou manualmente pelo app oficial do
simulado e confirmou ao vivo dois pontos que antes eram só suposição:

- **Código de cargo do TSE** — confirmado na documentação oficial
  ("Instruções para download", seção 5) e já preenchido em
  `TSE_CONFIG.officeCargoCode`: Presidente `0001`, Governador `0003`, Senador
  `0005`, Deputado Federal `0006`, Deputado Estadual `0007`. A URL do arquivo
  de resultado (EA20) já é construída de ponta a ponta.
- **Mecanismo de assinatura** — os arquivos vêm mesmo como um envelope JWS,
  mas com algoritmo **EdDSA (Ed25519)**, não RS256/ES256 como se cogitava
  antes. `src/data/jws.ts` já verifica esse algoritmo (testado com uma chave
  gerada localmente, assinatura válida e adulterada).

O que **ainda falta**, documentado como TODO explícito no código
(`src/data/tseConfig.ts`, `src/data/tseDataProvider.ts`, `src/data/jws.ts`) e
nunca contornado com valores inventados:

- **A chave pública real do TSE.** O manual oficial de verificação publica a
  chave em JWK e X.509, mas o apêndice já lido (Apêndice A) é explicitamente
  de **desenvolvimento** — "não válido para resultados oficiais". Sem a chave
  de produção, mesmo um arquivo `.jws` buscado com sucesso nunca é promovido a
  "pronto": o app continua mostrando honestamente "Dados indisponíveis" em vez
  de exibir um dado não verificado.
- **O padrão de URL em produção.** Confirmado ao vivo só para o ambiente de
  simulado; o ambiente oficial (`resultados.tse.jus.br/oficial`) segue por
  inferência simétrica, sem observação direta (a produção só abre com o
  pleito 3220, em 04/10/2026, ainda sem candidatos definidos).

Essa pesquisa foi feita por fontes secundárias verificáveis e por navegação
manual ao vivo, já que o acesso direto a `tse.jus.br` não estava disponível no
ambiente onde o código roda normalmente. **Antes de usar isto em uma eleição
real**, confirme os pontos acima diretamente na documentação oficial:

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
  exigem autenticação (segundo as fontes consultadas; não confirmado de forma
  explícita e documental — ver seção acima).

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
