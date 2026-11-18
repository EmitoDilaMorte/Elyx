import React from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import App from './App';
import { pushService } from './services/push.service';
import './styles.css';

// El service worker se registra siempre, no solo cuando el usuario activa push:
// sin el, una notificacion enviada con la app cerrada no se puede entregar.
// Es idempotente y no cachea nada, asi que no interfiere con el desarrollo.
void pushService.registrarServiceWorker();

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <BrowserRouter>
      <App />
    </BrowserRouter>
  </React.StrictMode>,
);
