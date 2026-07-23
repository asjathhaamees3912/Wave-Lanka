import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/router";
import axios from "axios";

const ZONES = [
  { id: 'all', name: 'All Zones', emoji: '🌍' },
  { id: 'east', name: 'Bay of Bengal (East)', emoji: '🌊' },
  { id: 'south', name: 'Indian Ocean (South)', emoji: '🌊' },
  { id: 'west', name: 'Gulf of Mannar (West)', emoji: '🌊' },
  { id: 'north', name: 'Palk Strait (North)', emoji: '🌊' },
  { id: 'sw', name: 'Lakshadweep Sea (SW)', emoji: '🌊' },
];

const THEME_COLORS = {
  dark: {
    bg: '#080808',
    text: '#ffffff',
    muted: 'rgba(255,255,255,0.45)',
    inputBg: 'rgba(255,255,255,0.06)',
    inputBorder: 'rgba(255,255,255,0.1)',
    navbarBorder: 'rgba(255,255,255,0.06)',
    userBubble: 'rgba(255,255,255,0.08)',
    aiAvatar: 'rgba(255,255,255,0.08)',
    modalBg: '#1a1a1a',
  },
  light: {
    bg: '#ffffff',
    text: '#0a0a0a',
    muted: 'rgba(0,0,0,0.45)',
    inputBg: 'rgba(0,0,0,0.04)',
    inputBorder: 'rgba(0,0,0,0.1)',
    navbarBorder: 'rgba(0,0,0,0.08)',
    userBubble: 'rgba(0,0,0,0.06)',
    aiAvatar: 'rgba(0,0,0,0.08)',
    modalBg: '#f5f5f5',
  },
};

function timeNow() {
  return new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

export default function ChatPage() {
  const router = useRouter();
  const [theme, setTheme] = useState('dark');
  const [systemTheme, setSystemTheme] = useState(null);
  const [sessionId] = useState(() => `sess_${Math.random().toString(36).slice(2)}`);
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState('');
  const [isTyping, setIsTyping] = useState(false);
  const [selectedZone, setSelectedZone] = useState('all');
  const [showSettings, setShowSettings] = useState(false);
  const messagesRef = useRef(null);
  const textareaRef = useRef(null);

  // Initialize theme from localStorage
  useEffect(() => {
    const savedTheme = localStorage.getItem('marinex-theme') || 'dark';
    setTheme(savedTheme);
    
    if (savedTheme === 'system') {
      const isDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
      setSystemTheme(isDark ? 'dark' : 'light');
    }

    const handler = (e) => {
      if (savedTheme === 'system') {
        setSystemTheme(e.matches ? 'dark' : 'light');
      }
    };
    
    window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', handler);
    return () => window.matchMedia('(prefers-color-scheme: dark)').removeEventListener('change', handler);
  }, []);

  // Auto-scroll messages
  useEffect(() => {
    messagesRef.current?.scrollTo({ top: messagesRef.current.scrollHeight, behavior: 'smooth' });
  }, [messages, isTyping]);



  const getTheme = () => {
    if (theme === 'system') return systemTheme === 'dark' ? THEME_COLORS.dark : THEME_COLORS.light;
    return THEME_COLORS[theme];
  };

  const colors = getTheme();

  const handleThemeChange = (newTheme) => {
    setTheme(newTheme);
    localStorage.setItem('marinex-theme', newTheme);
    
    if (newTheme === 'system') {
      const isDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
      setSystemTheme(isDark ? 'dark' : 'light');
    }
  };

  const handleClearChat = () => {
    setMessages([]);
    setInput('');
    setIsTyping(false);
    setShowSettings(false);
    try {
      axios.post('http://localhost:8000/chat/clear', null, { params: { session_id: sessionId }, timeout: 4000 });
    } catch (e) { /* best-effort */ }
  };

  async function sendMessage(text) {
    const trimmed = String(text || '').trim();
    if (!trimmed || isTyping) return;

    const zoneContext = selectedZone !== 'all' ? `[${ZONES.find(z => z.id === selectedZone)?.name}] ` : '';
    const fullMessage = zoneContext + trimmed;

    setMessages((m) => [...m, { role: 'user', content: trimmed, ts: timeNow() }]);
    setInput('');
    setIsTyping(true);

    try {
      const resp = await axios.post('/api/chat', { 
        message: fullMessage, 
        session_id: sessionId 
      });
      setMessages((m) => [...m, { role: 'ai', content: resp.data.reply, ts: timeNow() }]);
    } catch (err) {
      const msg = err?.response?.data?.detail || err?.message || 'Chat request failed.';
      setMessages((m) => [...m, { 
        role: 'ai', 
        content: `Sorry, I'm having trouble connecting right now. (${msg}) Please try again in a moment.`, 
        ts: timeNow() 
      }]);
    } finally {
      setIsTyping(false);
    }
  }

  function onTextareaKeyDown(e) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      sendMessage(input);
    }
  }

  function autoResize(el) {
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = Math.min(el.scrollHeight, 120) + 'px';
  }

  const hasConversation = messages.length > 0;

  return (
    <div style={{ background: colors.bg, color: colors.text, minHeight: '100vh' }}>
      {/* Top Navbar */}
      <header 
        style={{
          position: 'fixed',
          top: 0,
          left: 0,
          right: 0,
          height: '44px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          paddingLeft: '20px',
          paddingRight: '20px',
          zIndex: 100,
          borderBottom: `1px solid ${colors.navbarBorder}`,
          background: colors.bg,
        }}
      >
        {/* Logo + Name */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer' }} onClick={() => router.push('/')}>
          <div
            style={{
              width: '32px',
              height: '32px',
              borderRadius: '7px',
              background: colors.inputBg,
              border: `1px solid ${colors.inputBorder}`,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              overflow: 'hidden',
            }}
          >
            <img
              src="/logo-v2.png"
              alt="Wave Lanka Logo"
              style={{ width: '28px', height: '28px', objectFit: 'contain' }}
            />
          </div>
          <div style={{ fontSize: '0.9rem', fontWeight: 500, color: colors.text }}>
            MarineX AI
          </div>
        </div>

        {/* Settings Button */}
        <button
          onClick={() => setShowSettings(true)}
          style={{
            width: '40px',
            height: '40px',
            borderRadius: '50%',
            background: 'transparent',
            border: 'none',
            color: colors.muted,
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontSize: '22px',
            transition: 'all 0.2s',
          }}
          onMouseEnter={(e) => {
            e.target.style.color = colors.text;
            e.target.style.background = colors.inputBg;
          }}
          onMouseLeave={(e) => {
            e.target.style.color = colors.muted;
            e.target.style.background = 'transparent';
          }}
        >
          ⚙
        </button>
      </header>

      {/* Welcome State */}
      {!hasConversation && (
        <div
          style={{
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            minHeight: 'calc(100vh - 44px)',
            paddingTop: '44px',
            padding: '44px 20px 20px',
            animation: 'fadeIn 0.3s ease',
          }}
        >
          {/* Logo/Icon */}
          <img
            src="/logo-v2.png"
            alt="Wave Lanka Logo"
            style={{ width: '80px', height: '80px', objectFit: 'contain', marginBottom: '20px', opacity: 0.95 }}
          />

          {/* App Name */}
          <h1 style={{ fontSize: '2rem', fontWeight: 600, margin: '0 0 10px 0', letterSpacing: '-0.5px' }}>
            MarineX AI
          </h1>

          {/* Subtitle */}
          <p
            style={{
              fontSize: '0.9rem',
              color: colors.muted,
              textAlign: 'center',
              maxWidth: '420px',
              lineHeight: 1.5,
              marginBottom: '32px',
              margin: '0 0 32px 0',
            }}
          >
            Your intelligent marine companion. Ask about sea conditions, wave forecasts, or coastal safety.
          </p>

          {/* Input Box */}
          <div
            style={{
              width: 'min(600px, calc(100vw - 40px))',
              background: colors.inputBg,
              border: `1px solid ${colors.inputBorder}`,
              borderRadius: '16px',
              padding: '14px 16px',
              position: 'relative',
            }}
          >
            <textarea
              ref={textareaRef}
              value={input}
              onChange={(e) => {
                setInput(e.target.value);
                autoResize(e.target);
              }}
              onKeyDown={onTextareaKeyDown}
              placeholder="Ask anything about Sri Lanka sea conditions..."
              style={{
                width: '100%',
                background: 'transparent',
                border: 'none',
                outline: 'none',
                color: colors.text,
                fontSize: '0.95rem',
                fontFamily: 'inherit',
                resize: 'none',
                minHeight: '26px',
                maxHeight: '120px',
                lineHeight: 1.5,
              }}
            />

            {/* Bottom Row: Zone Selector + Send Button */}
            <div
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                marginTop: '10px',
              }}
            >
              {/* Clear Chat Button */}
              <button
                onClick={handleClearChat}
                disabled={!hasConversation}
                title="Clear chat"
                style={{
                  width: '32px',
                  height: '32px',
                  borderRadius: '8px',
                  background: 'transparent',
                  border: `1px solid ${colors.inputBorder}`,
                  color: colors.muted,
                  cursor: hasConversation ? 'pointer' : 'default',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  transition: 'all 0.15s',
                  opacity: hasConversation ? 1 : 0.4,
                }}
                onMouseEnter={(e) => {
                  if (hasConversation) {
                    e.currentTarget.style.background = 'rgba(239, 68, 68, 0.15)';
                    e.currentTarget.style.borderColor = 'rgba(239, 68, 68, 0.25)';
                    e.currentTarget.style.color = '#ef4444';
                  }
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.background = 'transparent';
                  e.currentTarget.style.borderColor = colors.inputBorder;
                  e.currentTarget.style.color = colors.muted;
                }}
              >
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <polyline points="3 6 5 6 21 6"></polyline>
                  <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path>
                  <line x1="10" y1="11" x2="10" y2="17"></line>
                  <line x1="14" y1="11" x2="14" y2="17"></line>
                </svg>
              </button>

              {/* Send Button */}
              <button
                onClick={() => sendMessage(input)}
                disabled={!input.trim() || isTyping}
                style={{
                  width: '32px',
                  height: '32px',
                  borderRadius: '8px',
                  background: input.trim() ? 'white' : colors.inputBg,
                  border: input.trim() ? 'none' : `1px solid ${colors.inputBorder}`,
                  color: input.trim() ? 'black' : colors.muted,
                  cursor: input.trim() && !isTyping ? 'pointer' : 'default',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  fontSize: '16px',
                  transition: 'all 0.15s',
                  opacity: input.trim() ? 1 : 0.6,
                }}
                onMouseEnter={(e) => {
                  if (input.trim()) {
                    e.target.style.background = 'rgba(255,255,255,0.85)';
                  }
                }}
                onMouseLeave={(e) => {
                  if (input.trim()) {
                    e.target.style.background = 'white';
                  }
                }}
              >
                ↑
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Messages Area */}
      {hasConversation && (
        <>
          <div
            ref={messagesRef}
            style={{
              position: 'fixed',
              top: '44px',
              bottom: '120px',
              left: 0,
              right: 0,
              overflowY: 'auto',
              padding: '20px 0',
            }}
          >
            <div style={{ maxWidth: '680px', margin: '0 auto', padding: '0 20px' }}>
              {messages.map((m, idx) => (
                <div
                  key={idx}
                  style={{
                    display: 'flex',
                    justifyContent: m.role === 'user' ? 'flex-end' : 'flex-start',
                    alignItems: m.role === 'user' ? 'center' : 'flex-start',
                    marginBottom: '16px',
                    gap: m.role === 'ai' ? '12px' : '0',
                  }}
                >
                  {m.role === 'ai' && (
                    <div
                      style={{
                        width: '28px',
                        height: '28px',
                        borderRadius: '7px',
                        background: colors.aiAvatar,
                        border: `1px solid ${colors.inputBorder}`,
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        fontSize: '14px',
                        flexShrink: 0,
                        marginTop: '2px',
                        overflow: 'hidden',
                      }}
                    >
                      <img
                        src="/logo-v2.png"
                        alt="MarineX Logo"
                        style={{ width: '20px', height: '20px', objectFit: 'contain' }}
                      />
                    </div>
                  )}

                  <div style={{ flex: m.role === 'ai' ? 1 : undefined, maxWidth: m.role === 'user' ? '70%' : undefined }}>
                    {m.role === 'ai' && (
                      <div style={{ fontSize: '0.72rem', fontWeight: 600, color: colors.muted, marginBottom: '4px' }}>
                        MarineX
                      </div>
                    )}

                    <div
                      style={
                        m.role === 'ai'
                          ? {
                              fontSize: '0.875rem',
                              color: colors.text,
                              lineHeight: 1.7,
                            }
                          : {
                              fontSize: '0.875rem',
                              color: colors.text,
                              background: colors.userBubble,
                              border: `1px solid ${colors.inputBorder}`,
                              borderRadius: '18px 18px 4px 18px',
                              padding: '10px 16px',
                              lineHeight: 1.6,
                            }
                      }
                    >
                      {m.content}
                    </div>
                  </div>
                </div>
              ))}

              {isTyping && (
                <div style={{ display: 'flex', gap: '12px', alignItems: 'flex-start', marginBottom: '16px' }}>
                  <div
                    style={{
                      width: '28px',
                      height: '28px',
                      borderRadius: '7px',
                      background: colors.aiAvatar,
                      border: `1px solid ${colors.inputBorder}`,
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      fontSize: '14px',
                      flexShrink: 0,
                      overflow: 'hidden',
                    }}
                  >
                    <img
                      src="/logo-v2.png"
                      alt="MarineX Logo"
                      style={{ width: '20px', height: '20px', objectFit: 'contain' }}
                    />
                  </div>
                  <div style={{ fontSize: '0.72rem', fontWeight: 600, color: colors.muted }}>
                    MarineX
                  </div>
                  <div style={{ display: 'flex', gap: '3px', alignItems: 'center' }}>
                    <span
                      style={{
                        width: '6px',
                        height: '6px',
                        background: colors.muted,
                        borderRadius: '50%',
                        animation: 'typingBounce 1s infinite',
                        animationDelay: '0ms',
                      }}
                    />
                    <span
                      style={{
                        width: '6px',
                        height: '6px',
                        background: colors.muted,
                        borderRadius: '50%',
                        animation: 'typingBounce 1s infinite',
                        animationDelay: '150ms',
                      }}
                    />
                    <span
                      style={{
                        width: '6px',
                        height: '6px',
                        background: colors.muted,
                        borderRadius: '50%',
                        animation: 'typingBounce 1s infinite',
                        animationDelay: '300ms',
                      }}
                    />
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* Fixed Input at Bottom */}
          <div
            style={{
              position: 'fixed',
              bottom: 0,
              left: 0,
              right: 0,
              background: colors.bg,
              padding: '12px 20px 20px',
              borderTop: `1px solid ${colors.navbarBorder}`,
              zIndex: 50,
            }}
          >
            <div style={{ maxWidth: '680px', margin: '0 auto' }}>
              <div
                style={{
                  background: colors.inputBg,
                  border: `1px solid ${colors.inputBorder}`,
                  borderRadius: '16px',
                  padding: '14px 16px',
                  position: 'relative',
                }}
              >
                <textarea
                  ref={textareaRef}
                  value={input}
                  onChange={(e) => {
                    setInput(e.target.value);
                    autoResize(e.target);
                  }}
                  onKeyDown={onTextareaKeyDown}
                  placeholder="Ask anything about Sri Lanka sea conditions..."
                  style={{
                    width: '100%',
                    background: 'transparent',
                    border: 'none',
                    outline: 'none',
                    color: colors.text,
                    fontSize: '0.95rem',
                    fontFamily: 'inherit',
                    resize: 'none',
                    minHeight: '26px',
                    maxHeight: '120px',
                    lineHeight: 1.5,
                  }}
                />

                {/* Bottom Row: Zone Selector + Send Button */}
                <div
                  style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    marginTop: '10px',
                  }}
                >
                  {/* Clear Chat Button */}
                  <button
                    onClick={handleClearChat}
                    disabled={!hasConversation}
                    title="Clear chat"
                    style={{
                      width: '32px',
                      height: '32px',
                      borderRadius: '8px',
                      background: 'transparent',
                      border: `1px solid ${colors.inputBorder}`,
                      color: colors.muted,
                      cursor: hasConversation ? 'pointer' : 'default',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      transition: 'all 0.15s',
                      opacity: hasConversation ? 1 : 0.4,
                    }}
                    onMouseEnter={(e) => {
                      if (hasConversation) {
                        e.currentTarget.style.background = 'rgba(239, 68, 68, 0.15)';
                        e.currentTarget.style.borderColor = 'rgba(239, 68, 68, 0.25)';
                        e.currentTarget.style.color = '#ef4444';
                      }
                    }}
                    onMouseLeave={(e) => {
                      e.currentTarget.style.background = 'transparent';
                      e.currentTarget.style.borderColor = colors.inputBorder;
                      e.currentTarget.style.color = colors.muted;
                    }}
                  >
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <polyline points="3 6 5 6 21 6"></polyline>
                      <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path>
                      <line x1="10" y1="11" x2="10" y2="17"></line>
                      <line x1="14" y1="11" x2="14" y2="17"></line>
                    </svg>
                  </button>

                  {/* Send Button */}
                  <button
                    onClick={() => sendMessage(input)}
                    disabled={!input.trim() || isTyping}
                    style={{
                      width: '32px',
                      height: '32px',
                      borderRadius: '8px',
                      background: input.trim() ? 'white' : colors.inputBg,
                      border: input.trim() ? 'none' : `1px solid ${colors.inputBorder}`,
                      color: input.trim() ? 'black' : colors.muted,
                      cursor: input.trim() && !isTyping ? 'pointer' : 'default',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      fontSize: '16px',
                      transition: 'all 0.15s',
                      opacity: input.trim() ? 1 : 0.6,
                    }}
                  >
                    ↑
                  </button>
                </div>
              </div>
            </div>
          </div>
        </>
      )}

      {/* Settings Modal */}
      {showSettings && (
        <div
          style={{
            position: 'fixed',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            background: 'rgba(0,0,0,0.6)',
            backdropFilter: 'blur(4px)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 2000,
          }}
          onClick={() => setShowSettings(false)}
        >
          <div
            style={{
              background: colors.modalBg,
              border: `1px solid ${colors.inputBorder}`,
              borderRadius: '16px',
              width: 'min(420px, calc(100vw - 40px))',
              padding: '20px 24px',
              animation: 'modalPop 0.2s ease',
            }}
            onClick={(e) => e.stopPropagation()}
          >
            {/* Header */}
            <div
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                marginBottom: '16px',
              }}
            >
              <div style={{ fontSize: '1rem', fontWeight: 600, color: colors.text, display: 'flex', alignItems: 'center', gap: '8px' }}>
                ⚙ Settings
              </div>
              <button
                onClick={() => setShowSettings(false)}
                style={{
                  width: '28px',
                  height: '28px',
                  borderRadius: '6px',
                  background: colors.inputBg,
                  border: 'none',
                  color: colors.text,
                  cursor: 'pointer',
                  fontSize: '20px',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  transition: 'all 0.2s',
                }}
                onMouseEnter={(e) => {
                  e.target.style.background = colors.inputBorder;
                }}
                onMouseLeave={(e) => {
                  e.target.style.background = colors.inputBg;
                }}
              >
                ×
              </button>
            </div>

            {/* Divider */}
            <div style={{ height: '1px', background: colors.inputBorder, margin: '16px 0' }} />

            {/* Appearance Setting */}
            <div
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                marginBottom: '16px',
              }}
            >
              <div style={{ fontSize: '0.7rem', letterSpacing: '1.5px', color: colors.text, textTransform: 'uppercase', fontWeight: 600 }}>
                🎨 Appearance
              </div>
              <select
                value={theme}
                onChange={(e) => handleThemeChange(e.target.value)}
                style={{
                  background: colors.inputBg,
                  border: `1px solid ${colors.inputBorder}`,
                  borderRadius: '8px',
                  padding: '8px 12px',
                  color: colors.text,
                  fontSize: '0.85rem',
                  cursor: 'pointer',
                  outline: 'none',
                  fontWeight: 500,
                }}
              >
                <option value="dark" style={{ background: colors.modalBg, color: colors.text }}>Dark</option>
                <option value="light" style={{ background: colors.modalBg, color: colors.text }}>Light</option>
                <option value="system" style={{ background: colors.modalBg, color: colors.text }}>System</option>
              </select>
            </div>

            {/* About */}
            <div
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
              }}
            >
              <div style={{ fontSize: '0.7rem', letterSpacing: '1.5px', color: colors.text, textTransform: 'uppercase', fontWeight: 600 }}>
                ℹ About
              </div>
              <div style={{ fontSize: '0.85rem', color: colors.text, fontWeight: 500 }}>MarineX v1.0</div>
            </div>
          </div>
        </div>
      )}

      <style jsx>{`
        @keyframes fadeIn {
          from {
            opacity: 0;
          }
          to {
            opacity: 1;
          }
        }
        @keyframes typingBounce {
          0%,
          60%,
          100% {
            transform: translateY(0);
          }
          30% {
            transform: translateY(-6px);
          }
        }
        @keyframes modalPop {
          from {
            opacity: 0;
            transform: scale(0.95);
          }
          to {
            opacity: 1;
            transform: scale(1);
          }
        }
      `}</style>
    </div>
  );
}
