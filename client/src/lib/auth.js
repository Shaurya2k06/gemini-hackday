/**
 * Auth API helpers (cookie session).
 */
import { apiFetch } from './api';

export async function fetchMe() {
  const res = await apiFetch('/auth/me', { credentials: 'include' });
  if (res.status === 401) return null;
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || 'Could not load session');
  return data.user ?? null;
}

export async function loginRequest(username, password) {
  const res = await apiFetch('/auth/login', {
    method: 'POST',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username, password }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || 'Login failed');
  return data.user;
}

export async function logoutRequest() {
  const res = await apiFetch('/auth/logout', {
    method: 'POST',
    credentials: 'include',
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || 'Logout failed');
  return true;
}

export async function listChats() {
  const res = await apiFetch('/chats', { credentials: 'include' });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || 'Could not load chats');
  return data.chats ?? [];
}

export async function getChat(id) {
  const res = await apiFetch(`/chats/${encodeURIComponent(id)}`, {
    credentials: 'include',
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || 'Could not load chat');
  return data.chat;
}

export async function createChat(payload) {
  const res = await apiFetch('/chats', {
    method: 'POST',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || 'Could not save chat');
  return data.chat;
}

export async function updateChat(id, payload) {
  const res = await apiFetch(`/chats/${encodeURIComponent(id)}`, {
    method: 'PATCH',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || 'Could not update chat');
  return data.chat;
}
