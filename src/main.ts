import './styles/styles.css';
import { AppContext } from './state/appContext';
import { applyRoute, currentRoute, pathForRoute, routeForState, toHref } from './state/router';
import { render } from './ui/app';
import { setupEvents } from './ui/events';

const root = document.getElementById('app');
if (!root) throw new Error('Elemento #app não encontrado');

const app = new AppContext();

// Um link direto (ex.: /governador/sp) tem prioridade sobre a página salva
// em localStorage (ver router.ts) — é o ponto todo de um link compartilhável.
// Visitar só a raiz do domínio, sem rota nenhuma, NÃO conta como escolha
// explícita (currentRoute() devolve null nesse caso) e mantém o que estava
// persistido.
const initialRoute = currentRoute();
if (initialRoute) applyRoute(app.state, initialRoute);

// `replaceState` (não `pushState`) — é a MESMA entrada de histórico da
// carga da página, só anexando o objeto de rota a ela, pra "voltar" do
// navegador até essa entrada (ver popstate em events.ts) restaurar o estado
// certo em vez de nada.
history.replaceState(routeForState(app.state), '', toHref(pathForRoute(routeForState(app.state))));

render(app, root);
setupEvents(app, root);
