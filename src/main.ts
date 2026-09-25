import './styles/styles.css';
import { AppContext } from './state/appContext';
import { render } from './ui/app';
import { setupEvents } from './ui/events';

const root = document.getElementById('app');
if (!root) throw new Error('Elemento #app não encontrado');

const app = new AppContext();
render(app, root);
setupEvents(app, root);
