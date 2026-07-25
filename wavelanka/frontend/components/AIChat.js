import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/router";
import axios from "axios";

const defaultSuggestions = [
  "Is it safe near Trincomalee today?",
  "What are conditions like in Galle?",
  "Will it be safe tomorrow morning?",
  "Any active weather warnings?",
  "Best time to go out this week?"
];

function defaultWelcomeMessage() {
  return {
    role: "ai",
    content:
      "Chat cleared. How can I help you today? Ask me about sea conditions for any Sri Lanka coastal zone."
  };
}

export default function AIChat({ selectedZoneName }) {
  const router = useRouter();
  const [sessionId, setSessionId] = useState(() => `sess_${Math.random().toString(36).slice(2)}`);
  const [input, setInput] = useState("");
  const [messages, setMessages] = useState([defaultWelcomeMessage()]);
  const [isTyping, setIsTyping] = useState(false);
  const bottomRef = useRef(null);

  const chatEndpoint = "/api/chat";

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, isTyping]);

  useEffect(() => {
    if (selectedZoneName) {
      // Zone-specific suggestion handled via chip below
    }
  }, [selectedZoneName]);

  useEffect(() => {
    const handleRouteChange = () => {
      clearChatSession();
    };

    router.events.on("routeChangeStart", handleRouteChange);
    return () => {
      router.events.off("routeChangeStart", handleRouteChange);
    };
  }, [router]);

  useEffect(() => {
    return () => {
      clearChatSession();
    };
  }, []);

  async function sendMessage(text) {
    const trimmed = String(text || "").trim();
    if (!trimmed || isTyping) return;

    setMessages((m) => [...m, { role: "user", content: trimmed }]);
    setInput("");
    setIsTyping(true);

    try {
      const resp = await axios.post(chatEndpoint, {
        message: trimmed,
        session_id: sessionId
      });
      setMessages((m) => [...m, { role: "ai", content: resp.data.reply }]);
    } catch (err) {
      const msg =
        err?.response?.data?.detail ||
        err?.response?.data?.error ||
        err?.message ||
        "Chat request failed.";

      setMessages((m) => [
        ...m,
        {
          role: "ai",
          content: `Sorry, I'm having trouble connecting right now. (${msg}) Please try again in a moment.`
        }
      ]);
    } finally {
      setIsTyping(false);
    }
  }

  async function clearChatSession() {
    setInput("");
    setIsTyping(false);
    const newId = `sess_${Math.random().toString(36).slice(2)}`;
    setSessionId(newId);
    setMessages([defaultWelcomeMessage()]);

    try {
      await axios.post(`${process.env.NEXT_PUBLIC_AI_URL || "http://localhost:8000"}/chat/clear`, null, {
        params: { session_id: newId },
        timeout: 5000,
      });
    } catch (e) {
      // Best effort only
    }
  }

  async function clearChat() {
    await clearChatSession();
  }

  return (
    <div className="rounded-2xl border border-[var(--chat-border)] bg-[var(--bg-ocean-card)] flex flex-col h-[500px] overflow-hidden shadow-lg transition-all duration-300">
      {/* Header */}
      <div className="px-5 py-4 border-b border-[var(--chat-border-subtle)] bg-[var(--chat-header-bg)] flex items-center justify-between">
        <div>
          <div className="flex items-center gap-2">
            <span className="h-2 w-2 rounded-full bg-cyan-400 animate-pulse shadow-[0_0_8px_rgba(34,211,238,0.7)]" />
            <h3 className="text-sm font-bold text-[var(--text-primary)]">MarineX AI Advisor</h3>
          </div>
          <p className="text-[10px] text-[var(--text-secondary)] mt-0.5">Real-time advisory chat assistant</p>
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={clearChat}
            className="rounded-lg border border-slate-300/50 bg-slate-50/80 px-3 py-1 text-[10px] font-semibold text-slate-700 hover:bg-slate-100 hover:text-slate-900 transition-all duration-200"
          >
            Clear chat
          </button>
        </div>
      </div>

      {/* Message List */}
      <div className="flex-1 overflow-y-auto p-5 space-y-4">
        {messages.map((m, idx) => {
          const isUser = m.role === "user";
          return (
            <div
              key={idx}
              className={`flex ${isUser ? "justify-end" : "justify-start"}`}
            >
              <div
                className={`max-w-[85%] rounded-2xl px-4 py-2.5 text-xs leading-relaxed shadow-sm border transition-all duration-200 ${
                  isUser
                    ? "bg-gradient-to-r from-sky-600 to-blue-700 text-white rounded-br-none border-sky-500/20 shadow-[0_2px_8px_rgba(2,136,209,0.15)]"
                    : "bg-[var(--chat-surface)] text-[var(--text-primary)] rounded-bl-none border-[var(--chat-border)]"
                }`}
              >
                {!isUser && (
                  <div className="text-[9px] font-extrabold uppercase text-[var(--primary-cyan)] mb-1 tracking-wider">
                    MarineX
                  </div>
                )}
                <div className="whitespace-pre-line font-medium">{m.content}</div>
              </div>
            </div>
          );
        })}

        {isTyping && (
          <div className="flex justify-start">
            <div className="bg-[var(--chat-surface)] border border-[var(--chat-border)] text-[var(--text-primary)] rounded-2xl rounded-bl-none px-4 py-3 text-xs shadow-sm flex items-center gap-1.5">
              <span className="text-[9px] font-extrabold uppercase text-[var(--primary-cyan)] tracking-wider mr-1">MarineX</span>
              <div className="flex gap-1 items-center">
                <span className="w-1.5 h-1.5 bg-cyan-400 rounded-full animate-bounce" style={{ animationDelay: "0ms" }} />
                <span className="w-1.5 h-1.5 bg-cyan-400 rounded-full animate-bounce" style={{ animationDelay: "150ms" }} />
                <span className="w-1.5 h-1.5 bg-cyan-400 rounded-full animate-bounce" style={{ animationDelay: "300ms" }} />
              </div>
            </div>
          </div>
        )}
        <div ref={bottomRef} />
      </div>

      {/* Input controls */}
      <div className="p-4 border-t border-[var(--chat-border-subtle)] bg-[var(--chat-footer-bg)] space-y-3">
        {/* Suggestion tags */}
        <div className="flex flex-wrap gap-1.5">
          {defaultSuggestions.map((s) => (
            <button
              key={s}
              onClick={() => sendMessage(s)}
              className="rounded-lg border border-[var(--chat-border)] bg-[var(--chat-chip-bg)] px-2.5 py-1 text-[10px] font-semibold text-[var(--text-secondary)] hover:text-[var(--primary-cyan)] hover:border-sky-500/30 transition-all duration-200"
            >
              {s}
            </button>
          ))}
          {selectedZoneName && (
            <button
              onClick={() => sendMessage(`How safe is ${selectedZoneName} right now?`)}
              className="rounded-lg border border-cyan-500/20 bg-cyan-500/5 px-2.5 py-1 text-[10px] font-bold text-cyan-400 hover:text-cyan-300 hover:border-cyan-500/40 hover:bg-cyan-500/10 transition-all duration-200"
            >
              Check {selectedZoneName}
            </button>
          )}
        </div>

        {/* Input box */}
        <form
          onSubmit={(e) => {
            e.preventDefault();
            sendMessage(input);
          }}
          className="flex gap-2"
        >
          <input
            className="flex-1 rounded-xl border border-[var(--chat-border)] bg-[var(--chat-input-bg)] px-3.5 py-2.5 text-xs text-[var(--text-primary)] placeholder-[var(--text-muted)] outline-none focus:border-sky-500/50 focus:ring-1 focus:ring-sky-500/20 transition-all"
            placeholder="Type your message about coastal conditions..."
            value={input}
            onChange={(e) => setInput(e.target.value)}
          />
          <button
            type="submit"
            className="rounded-xl bg-gradient-to-r from-sky-600 to-blue-700 hover:from-sky-500 hover:to-blue-600 px-4 py-2.5 text-xs font-bold text-white shadow-md transition-all disabled:opacity-50 flex items-center justify-center gap-1"
            disabled={isTyping || !input.trim()}
          >
            <span>Send</span>
          </button>
        </form>
      </div>
    </div>
  );
}
