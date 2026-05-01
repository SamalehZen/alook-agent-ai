"use client";

import { useCallback, useState } from "react";
import type { Agent } from "@alook/shared";
import { Check, Copy } from "lucide-react";
import { toast } from "sonner";
import { AvatarRenderer, parseAvatarUrl } from "@/components/avatar";
import { AgentStatusBadge } from "@/components/agent-status-badge";

interface AgentPreviewCardProps {
  agent: Agent;
  isOnline?: boolean;
  activeTaskCount?: number;
  variant?: "default" | "compact";
}

export function AgentPreviewCard({
  agent,
  isOnline,
  activeTaskCount,
  variant = "default",
}: AgentPreviewCardProps) {
  const [copied, setCopied] = useState(false);
  const email = agent.email_handle ? `${agent.email_handle}@alook.ai` : null;
  const isCompact = variant === "compact";

  const handleCopy = useCallback(async () => {
    if (!email) return;
    try {
      await navigator.clipboard.writeText(email);
      setCopied(true);
      toast.success("Email copied to clipboard");
      setTimeout(() => setCopied(false), 2000);
    } catch {
      toast.error("Failed to copy email");
    }
  }, [email]);

  if (isCompact) {
    return (
      <div className="flex items-center gap-2 p-0">
        {(() => {
          const avatarConfig = parseAvatarUrl(agent.avatar_url);
          if (avatarConfig) {
            return <AvatarRenderer config={avatarConfig} size={32} className="shrink-0 rounded-xl" />;
          }
          return (
            <div className="flex items-center justify-center size-8 rounded-xl bg-secondary text-secondary-foreground text-xs font-medium shrink-0">
              {agent.name.charAt(0).toUpperCase()}
            </div>
          );
        })()}
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1.5">
            <p className="text-sm font-medium truncate max-w-[140px]">{agent.name}</p>
            {email && (
              <span className="text-xs text-muted-foreground truncate">{email}</span>
            )}
          </div>
          {isOnline !== undefined && (
            <div className="pointer-events-none mt-0.5">
              <AgentStatusBadge
                isOnline={isOnline}
                taskCount={activeTaskCount ?? 0}
                agentId={agent.id}
              />
            </div>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-2.5 p-1">
      <div className="flex items-start gap-3">
        {(() => {
          const avatarConfig = parseAvatarUrl(agent.avatar_url);
          if (avatarConfig) {
            return <AvatarRenderer config={avatarConfig} size={40} className="shrink-0 rounded-xl" />;
          }
          return (
            <div className="flex items-center justify-center size-10 rounded-xl bg-secondary text-secondary-foreground text-sm font-medium shrink-0">
              {agent.name.charAt(0).toUpperCase()}
            </div>
          );
        })()}
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1.5">
            <p className="text-sm font-medium truncate">{agent.name}</p>
            {isOnline !== undefined && (
              <AgentStatusBadge
                isOnline={isOnline}
                taskCount={activeTaskCount ?? 0}
                agentId={agent.id}
              />
            )}
          </div>
          {email && (
            <div className="flex items-center gap-1 mt-0.5">
              <span className="text-xs text-muted-foreground truncate">{email}</span>
              <button
                type="button"
                onClick={(e) => { e.stopPropagation(); handleCopy(); }}
                className="shrink-0 p-0.5 rounded-sm text-muted-foreground/60 hover:text-foreground transition-colors cursor-pointer"
              >
                {copied ? (
                  <Check className="size-3 text-green-500" />
                ) : (
                  <Copy className="size-3" />
                )}
              </button>
            </div>
          )}
        </div>
      </div>
      {agent.description && (
        <p className="text-xs text-muted-foreground line-clamp-2">{agent.description}</p>
      )}
    </div>
  );
}
