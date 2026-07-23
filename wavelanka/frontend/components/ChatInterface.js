import { useEffect, useMemo, useRef, useState } from "react";
import axios from "axios";

const defaultSuggestions = [
  "Is it safe near Trincomalee today?",
  "Best day to fish this week?",
  "What is the swell forecast for Galle?"
];

export default function ChatInterface() {
  const [sessionId] = useState(() => `sess_${Math.random().toString(36).slice(2)}`);
  const [input, setInput] = useState("");
  const [messages, setMessages] = useState([
    {
      role: "ai",
      content:
        "Ask me about marine safety in Sri Lanka. I’ll give a clear verdict first, then explain why."
    }
  ]);
  const [isTyping, setIsTyping] = useState(false);
  const bottomRef = useRef(null);

  const aiBaseUrl =
    process.env.NEXT_PUBLIC_AI_URL || "http://localhost:8000";

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, isTyping]);

  async function sendMessage(text) {
    const trimmed = String(text || "").trim();
    if (!trimmed || isTyping) return;

    setMessages((m) => [...m, { role: "user", content: trimmed }]);
    setInput("");
    setIsTyping(true);

    try {
      const resp = await axios.post(`${aiBaseUrl}/chat`, {
        message: trimmed,
        session_id: sessionId
      });
      setMessages((m) => [...m, { role: "ai", content: resp.data.reply }]);
    } catch (err) {
      const msg =
        err?.response?.data?.detail ||
        err?.message ||
        "Chat request failed.";
      setMessages((m) => [
        ...m,
        {
          role: "ai",
          content: `Sorry — I couldn’t reach the AI service. (${msg})`
        }
      ]);
    } finally {
      setIsTyping(false);
    }
  }

  return (
    <div className="mx-auto max-w-3xl">
      <div className="rounded-2xl bg-white/80 backdrop-blur border border-slate-200 shadow-sm overflow-hidden">
        <div className="p-4 border-b border-slate-200">
          <div className="text-lg font-semibold text-slate-900">AI Chat</div>
          <div className="text-sm text-slate-600">
            MarineX helps with Sri Lanka marine safety decisions.
          </div>
        </div>

        <div className="h-[60vh] overflow-y-auto p-4 space-y-3">
          {messages.map((m, idx) => {
            const isUser = m.role === "user";
            return (
              <div
                key={idx}
                className={`flex ${isUser ? "justify-end" : "justify-start"}`}
              >
                <div
                  className={`max-w-[85%] rounded-2xl px-4 py-2 text-sm leading-relaxed shadow-sm ${
                    isUser
                      ? "bg-blue-600 text-white rounded-br-md"
                      : "bg-slate-100 text-slate-900 rounded-bl-md"
                  }`}
                >
                  {m.content}
                </div>
              </div>
            );
          })}

          {isTyping ? (
            <div className="flex justify-start">
              <div className="bg-slate-100 text-slate-900 rounded-2xl rounded-bl-md px-4 py-2 text-sm shadow-sm">
                Typing…
              </div>
            </div>
          ) : null}
          <div ref={bottomRef} />
        </div>

        <div className="p-4 border-t border-slate-200 space-y-3">
          <div className="flex flex-wrap gap-2">
            {defaultSuggestions.map((s) => (
              <button
                key={s}
                onClick={() => sendMessage(s)}
                className="rounded-full border border-slate-200 bg-white px-3 py-1 text-xs text-slate-700 hover:bg-slate-50"
              >
                {s}
              </button>
            ))}
          </div>

          <form
            onSubmit={(e) => {
              e.preventDefault();
              sendMessage(input);
            }}
            className="flex gap-2"
          >
            <input
              className="flex-1 rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
              placeholder="Ask a question…"
              value={input}
              onChange={(e) => setInput(e.target.value)}
            />
            <button
              type="submit"
              className="rounded-xl bg-slate-900 px-4 py-2 text-sm font-semibold text-white hover:bg-slate-800 disabled:opacity-50"
              disabled={isTyping}
            >
              Send
            </button>
          </form>
        </div>
      </div>

      <div className="mt-3 text-xs text-slate-500">
        AI endpoint: {aiBaseUrl}
      </div>
    </div>
  );
}

