"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useWorkspace } from "@/contexts/workspace-context";
import { cn } from "@/lib/utils";
import { MessageSquare, Mail } from "lucide-react";

interface AgentDetailSidebarProps {
  agentId: string;
}

const items = [
  { key: "chat", label: "Chat", icon: MessageSquare },
  { key: "email", label: "Email", icon: Mail },
] as const;

export function AgentDetailSidebar({ agentId }: AgentDetailSidebarProps) {
  const pathname = usePathname();
  const { slug } = useWorkspace();
  const base = `/w/${slug}/agents/${agentId}`;

  return (
    <nav className="flex w-40 shrink-0 flex-col gap-0.5 border-r border-border/40 p-2">
      {items.map(({ key, label, icon: Icon }) => {
        const href = `${base}/${key}`;
        const isActive = pathname.startsWith(href);
        return (
          <Link
            key={key}
            href={href}
            className={cn(
              "flex items-center gap-2 rounded-lg px-2.5 py-1.5 text-sm transition-colors duration-150",
              isActive
                ? "bg-accent text-accent-foreground font-medium"
                : "text-muted-foreground hover:bg-accent/50 hover:text-foreground"
            )}
          >
            <Icon className="size-4" />
            {label}
          </Link>
        );
      })}
    </nav>
  );
}
