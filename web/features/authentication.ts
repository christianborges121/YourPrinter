/**
 * @fileoverview Authentication helpers and event wiring for the WebUI client.
 *
 * Manages login/logout flows, token persistence, and authentication status
 * checks. Exposes event handler setup with optional hooks so the orchestrator
 * can trigger additional work (e.g., WebSocket connect, context refresh)
 * without tightly coupling modules.
 */

import { state } from '../core/AppState.js';
import { disconnectWebSocket } from '../core/Transport.js';
import { $, hideElement, setTextContent, showElement } from '../shared/dom.js';

export interface AuthEventHandlers {
  onLoginSuccess?: () => Promise<void> | void;
  onLogout?: () => Promise<void> | void;
}

let authHandlers: AuthEventHandlers = {};

export function setupAuthEventHandlers(handlers: AuthEventHandlers = {}): void {
  authHandlers = handlers;

  const loginBtn = $('login-button');
  const passwordInput = $('password-input') as HTMLInputElement | null;
  const rememberMe = $('remember-me-checkbox') as HTMLInputElement | null;

  if (loginBtn && passwordInput) {
    loginBtn.addEventListener('click', async () => {
      const password = passwordInput.value;
      const remember = rememberMe?.checked ?? false;

      if (!password) {
        setTextContent('login-error', 'Please enter a password');
        return;
      }

      loginBtn.textContent = 'Logging in...';
      (loginBtn as HTMLButtonElement).disabled = true;

      const success = await login(password, remember);
      if (success) {
        hideElement('login-screen');
        showElement('main-ui');
        if (authHandlers.onLoginSuccess) {
          await authHandlers.onLoginSuccess();
        }
      }

      loginBtn.textContent = 'Login';
      (loginBtn as HTMLButtonElement).disabled = false;
    });

    passwordInput.addEventListener('keypress', (event) => {
      if (event.key === 'Enter') {
        loginBtn.click();
      }
    });
  }

  const logoutButtons = [$('logout-button'), $('mobile-logout-button')];
  logoutButtons.forEach((btn) => {
    btn?.addEventListener('click', async () => {
      const drawer = $('mobile-nav-drawer');
      if (drawer) {
        drawer.classList.add('hidden');
        drawer.classList.remove('open');
      }
      await logout();
      if (authHandlers.onLogout) {
        await authHandlers.onLogout();
      }
    });
  });
}

export async function login(_password: string, _rememberMe: boolean): Promise<boolean> {
  state.authRequired = false;
  state.isAuthenticated = true;
  return true;
}

export async function logout(): Promise<void> {
  state.authToken = null;
  state.isAuthenticated = true;
  disconnectWebSocket();
  hideElement('login-screen');
  showElement('main-ui');
}

export async function loadAuthStatus(): Promise<void> {
  state.authRequired = false;
  state.defaultPassword = false;
  state.hasPassword = false;
  state.isAuthenticated = true;
}

export async function checkAuthStatus(): Promise<boolean> {
  state.authRequired = false;
  state.authToken = null;
  state.isAuthenticated = true;
  return true;
}
