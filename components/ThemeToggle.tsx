"use client";

import { useCallback, useEffect, useState } from "react";
import { Moon, Sun, Monitor } from "lucide-react";

type Theme = "light" | "dark" | "system";

function getSystemTheme(): "light" | "dark" {
  if (typeof window === "undefined") return "light";
  return window.matchMedia("(prefers-color-scheme: dark)").matches
    ? "dark"
    : "light";
}

function applyTheme(theme: Theme) {
  const resolved = theme === "system" ? getSystemTheme() : theme;
  document.documentElement.classList.toggle("dark", resolved === "dark");
}

const icons: Record<Theme, typeof Sun> = {
  light: Sun,
  dark: Moon,
  system: Monitor,
};

export default function ThemeToggle() {
  const [theme, setTheme] = useState<Theme>("system");

  useEffect(() => {
    const stored = localStorage.getItem("theme") as Theme | null;
    const t = stored ?? "system";
    setTheme(t);
    applyTheme(t);

    const mq = window.matchMedia("(prefers-color-scheme: dark)");
    const handler = () => {
      // Read the live preference: the user may have switched modes since mount.
      const current = (localStorage.getItem("theme") as Theme | null) ?? "system";
      if (current === "system") applyTheme("system");
    };
    mq.addEventListener("change", handler);
    return () => mq.removeEventListener("change", handler);
  }, []);

  const toggle = useCallback(() => {
    const next: Record<Theme, Theme> = {
      light: "dark",
      dark: "system",
      system: "light",
    };
    const t = next[theme];
    setTheme(t);
    localStorage.setItem("theme", t);
    applyTheme(t);
  }, [theme]);

  const Icon = icons[theme];

  return (
    <button
      onClick={toggle}
      title={`Theme: ${theme}`}
      className="rounded p-1.5 text-gray-500 hover:bg-gray-100 dark:text-gray-400 dark:hover:bg-gray-800"
    >
      <Icon size={16} />
    </button>
  );
}
