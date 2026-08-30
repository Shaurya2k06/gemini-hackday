import React, { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ChevronLeft, ChevronRight, MessageSquare, Plus, LogOut } from 'lucide-react';
import { listChats, getChat } from '../../lib/auth';
import { useAuth } from '../../lib/AuthContext';
import { clearDiscoveryState, saveDiscoveryState } from '../../lib/discoveryStorage';

function formatRelative(dateStr) {
  const d = new Date(dateStr);
  if (Number.isNaN(d.getTime())) return '';
  const diffMs = Date.now() - d.getTime();
  const mins = Math.floor(diffMs / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days}d ago`;
  return d.toLocaleDateString();
}

/**
 * Collapsible recent-chats panel for authenticated screening UI.
 */
export function ChatSidebar({ open, onToggle, refreshKey = 0, activeChatId = null }) {
  const navigate = useNavigate();
  const { user, logout } = useAuth();
  const [chats, setChats] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [openingId, setOpeningId] = useState(null);

  const load = useCallback(async () => {
    if (!user) return;
    setLoading(true);
    setError(null);
    try {
      const rows = await listChats();
      setChats(rows);
    } catch (err) {
      setError(err.message ?? 'Could not load chats');
    } finally {
      setLoading(false);
    }
  }, [user]);

  useEffect(() => {
    load();
  }, [load, refreshKey]);

  const handleNewChat = () => {
    clearDiscoveryState();
    navigate('/chat');
  };

  const handleOpenChat = async (id) => {
    if (openingId) return;
    setOpeningId(id);
    setError(null);
    try {
      const chat = await getChat(id);
      const payload = {
        chatId: chat.id,
        companies: chat.companies ?? [],
        cards: chat.cards ?? [],
        structured: chat.structured,
        rawQuery: chat.rawQuery,
        message: chat.message,
        constraintMode: chat.constraintMode ?? 'heavy',
        customColumns: chat.customColumns ?? [],
      };
      saveDiscoveryState(payload);
      navigate('/results', { state: payload });
    } catch (err) {
      setError(err.message ?? 'Could not open chat');
    } finally {
      setOpeningId(null);
    }
  };

  const handleLogout = async () => {
    clearDiscoveryState();
    await logout();
    navigate('/');
  };

  return (
    <>
      <aside
        className={`shrink-0 h-full border-r border-[#dfdcd5] dark:border-[#222] bg-[#f5f4f1] dark:bg-[#111] transition-[width] duration-200 ease-out overflow-hidden ${
          open ? 'w-[240px]' : 'w-0'
        }`}
      >
        {open ? (
          <div className="w-[240px] h-full flex flex-col">
            <div className="flex items-center justify-between px-3 py-3 border-b border-[#dfdcd5] dark:border-[#222]">
              <span className="text-xs font-medium uppercase tracking-wider text-[#595855] dark:text-[#808080]">
                Recent
              </span>
              <button
                type="button"
                onClick={onToggle}
                className="p-1 rounded-md hover:bg-black/5 dark:hover:bg-white/5 border-none bg-transparent cursor-pointer text-[#595855] dark:text-[#808080]"
                aria-label="Collapse sidebar"
              >
                <ChevronLeft size={16} />
              </button>
            </div>

            <div className="px-2 py-2">
              <button
                type="button"
                onClick={handleNewChat}
                className="w-full inline-flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg text-xs font-medium bg-black text-white dark:bg-white dark:text-black border-none cursor-pointer"
              >
                <Plus size={12} />
                New screening
              </button>
            </div>

            <div className="flex-1 overflow-y-auto px-2 pb-2 space-y-1">
              {loading ? (
                <p className="text-xs text-[#595855] dark:text-[#808080] px-2 py-3">Loading…</p>
              ) : null}
              {error ? (
                <p className="text-xs text-amber-700 dark:text-amber-400 px-2 py-2">{error}</p>
              ) : null}
              {!loading && !error && chats.length === 0 ? (
                <p className="text-xs text-[#595855] dark:text-[#808080] px-2 py-3 leading-relaxed">
                  No saved screenings yet. Run a search — chats appear after a shortlist table is ready.
                </p>
              ) : null}
              {chats.map((chat) => {
                const active = activeChatId && chat.id === activeChatId;
                return (
                  <button
                    key={chat.id}
                    type="button"
                    onClick={() => handleOpenChat(chat.id)}
                    disabled={Boolean(openingId)}
                    className={`w-full text-left px-2.5 py-2 rounded-lg border-none cursor-pointer disabled:opacity-50 ${
                      active
                        ? 'bg-black/10 dark:bg-white/10'
                        : 'bg-transparent hover:bg-black/5 dark:hover:bg-white/5'
                    }`}
                  >
                    <div className="flex items-start gap-2">
                      <MessageSquare
                        size={14}
                        className="mt-0.5 shrink-0 text-[#595855] dark:text-[#808080]"
                      />
                      <div className="min-w-0 flex-1">
                        <p className="text-xs text-black dark:text-white truncate font-medium">
                          {chat.title}
                        </p>
                        <p className="text-[10px] text-[#595855] dark:text-[#808080] mt-0.5">
                          {openingId === chat.id
                            ? 'Opening…'
                            : `${chat.companyCount} companies · ${formatRelative(chat.updatedAt)}`}
                        </p>
                      </div>
                    </div>
                  </button>
                );
              })}
            </div>

            <div className="border-t border-[#dfdcd5] dark:border-[#222] px-3 py-2 flex items-center justify-between gap-2">
              <span className="text-[11px] text-[#595855] dark:text-[#808080] truncate">
                {user?.username}
              </span>
              <button
                type="button"
                onClick={handleLogout}
                className="inline-flex items-center gap-1 px-2 py-1 rounded-md text-[11px] text-[#595855] dark:text-[#808080] hover:bg-black/5 dark:hover:bg-white/5 border-none bg-transparent cursor-pointer"
                title="Log out"
              >
                <LogOut size={12} />
                Log out
              </button>
            </div>
          </div>
        ) : null}
      </aside>

      {!open ? (
        <button
          type="button"
          onClick={onToggle}
          className="fixed left-3 top-1/2 -translate-y-1/2 z-40 p-2 rounded-full bg-white dark:bg-[#161616] border border-[#dfdcd5] dark:border-[#333] shadow-md cursor-pointer text-[#595855] dark:text-[#a0a0a0] hover:text-black dark:hover:text-white"
          aria-label="Open recent chats"
        >
          <ChevronRight size={16} />
        </button>
      ) : null}
    </>
  );
}
