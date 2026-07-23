import "@/styles/globals.css";
import "leaflet/dist/leaflet.css";

import { createContext, useContext, useEffect, useState } from "react";
import FloatingAIAssistant from "@/components/FloatingAIAssistant";
import CreatorCredit from "@/components/CreatorCredit";

// Import Google Fonts via Fontsource
import "@fontsource/inter/400.css";
import "@fontsource/inter/500.css";
import "@fontsource/inter/700.css";
import "@fontsource/inter/900.css";
import "@fontsource/space-grotesk/500.css";
import "@fontsource/space-grotesk/700.css";

// Theme Context
const ThemeContext = createContext({
  theme: "dark",
  toggleTheme: () => {},
});

export function useTheme() {
  return useContext(ThemeContext);
}

export default function App({ Component, pageProps }) {
  const [theme, setTheme] = useState("dark");

  useEffect(() => {
    const savedTheme = localStorage.getItem("wavelanka-theme") || "dark";
    setTheme(savedTheme);
    if (savedTheme === "light") {
      document.documentElement.classList.add("light");
    } else {
      document.documentElement.classList.remove("light");
    }
  }, []);

  const toggleTheme = () => {
    const newTheme = theme === "dark" ? "light" : "dark";
    setTheme(newTheme);
    localStorage.setItem("wavelanka-theme", newTheme);
    if (newTheme === "light") {
      document.documentElement.classList.add("light");
    } else {
      document.documentElement.classList.remove("light");
    }
  };

  return (
    <ThemeContext.Provider value={{ theme, toggleTheme }}>
      <Component {...pageProps} />
      <FloatingAIAssistant />
      <CreatorCredit />
    </ThemeContext.Provider>
  );
}
