"use client";

import { useEffect, useRef, useState } from "react";
import { useTheme } from "next-themes";
import { Sun, Moon, Monitor } from "lucide-react";
import { Button } from "@/components/ui/button";

const themes = ["system", "light", "dark"] as const;

export function ThemeToggle() {
  const { theme, setTheme } = useTheme();
  const [mounted, setMounted] = useState(false);
  const mountedRef = useRef(setMounted);

  useEffect(() => { mountedRef.current(true); }, []);

  const cycle = () => {
    const i = themes.indexOf(theme as (typeof themes)[number]);
    setTheme(themes[(i + 1) % themes.length]);
  };

  if (!mounted) {
    return (
      <Button variant="ghost" size="sm" disabled>
        <Monitor className="size-4" />
      </Button>
    );
  }

  const Icon = theme === "dark" ? Moon : theme === "light" ? Sun : Monitor;

  return (
    <Button variant="ghost" size="sm" onClick={cycle} aria-label="Toggle theme">
      <Icon className="size-4" />
    </Button>
  );
}
