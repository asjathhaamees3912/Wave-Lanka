import Link from "next/link";
import { useRouter } from "next/router";
import BrandLogo from "@/components/BrandLogo";

export default function FloatingAIAssistant() {
  const router = useRouter();

  // Already on the chat page — no need for the shortcut
  if (router.pathname === "/chat") return null;

  return (
    <Link
      href="/chat"
      title="Open MarineX AI Safety Chat"
      aria-label="Open MarineX AI Safety Chat"
      className="fixed bottom-6 right-6 z-[1010] group flex items-center gap-2.5 rounded-full border border-[var(--chat-border)] bg-[var(--bg-ocean-card)]/95 pl-2 pr-4 py-2 shadow-lg backdrop-blur-md transition-all duration-300 hover:scale-105 hover:border-sky-500/40 hover:shadow-sky-500/20 hover:shadow-xl active:scale-95"
    >
      <span className="relative flex h-10 w-10 items-center justify-center rounded-full bg-gradient-to-br from-sky-500/20 to-blue-600/20 border border-sky-500/25">
        <span className="absolute inset-0 rounded-full bg-sky-400/20 animate-ping opacity-60" />
        <BrandLogo className="relative h-7 w-7 drop-shadow-[0_0_6px_rgba(14,165,233,0.3)]" />
      </span>
      <span className="flex flex-col leading-tight">
        <span className="text-[9px] font-extrabold uppercase tracking-widest text-[var(--primary-cyan)]">
          MarineX
        </span>
        <span className="text-[11px] font-bold text-[var(--text-primary)] group-hover:text-sky-400 transition-colors">
          AI Assistant
        </span>
      </span>
    </Link>
  );
}
