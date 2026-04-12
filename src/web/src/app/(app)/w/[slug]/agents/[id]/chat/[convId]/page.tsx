"use client";

import { useEffect, useState, useRef, useCallback } from "react";
import { useParams } from "next/navigation";
import { useWorkspace } from "@/contexts/workspace-context";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  getConversation,
  listMessages,
  sendMessage,
  getTask,
  getTaskMessages,
} from "@/lib/api";
import type { Conversation, Message, TaskMessage } from "@alook/shared";
import type { Task } from "@/lib/api";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { ArrowUp, Loader2 } from "lucide-react";
import { Streamdown } from "streamdown";

export default function AgentChatDetailPage() {
  const params = useParams();
  const { workspaceId } = useWorkspace();
  const conversationId = params.convId as string;

  const [conversation, setConversation] = useState<Conversation | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);
  const [activeTask, setActiveTask] = useState<Task | null>(null);
  const [taskMessages, setTaskMessages] = useState<TaskMessage[]>([]);
  const [loading, setLoading] = useState(true);
  const [connectionLost, setConnectionLost] = useState(false);

  const scrollRef = useRef<HTMLDivElement>(null);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const lastSeqRef = useRef(0);
  const pollFailures = useRef(0);

  const scrollToBottom = useCallback(() => {
    setTimeout(() => {
      scrollRef.current?.scrollTo({
        top: scrollRef.current.scrollHeight,
        behavior: "smooth",
      });
    }, 50);
  }, []);

  useEffect(() => {
    async function load() {
      try {
        const [conv, msgs] = await Promise.all([
          getConversation(conversationId, workspaceId),
          listMessages(conversationId, workspaceId),
        ]);
        setConversation(conv);
        setMessages(msgs);
      } catch {
        toast.error("Conversation not found");
      } finally {
        setLoading(false);
      }
    }
    load();
  }, [conversationId, workspaceId]);

  useEffect(() => {
    scrollToBottom();
  }, [messages, taskMessages, scrollToBottom]);

  const startPolling = useCallback(
    (taskId: string) => {
      if (pollRef.current) clearInterval(pollRef.current);
      lastSeqRef.current = 0;
      pollFailures.current = 0;
      setConnectionLost(false);

      pollRef.current = setInterval(async () => {
        try {
          const [task, tmsgs] = await Promise.all([
            getTask(taskId, workspaceId),
            getTaskMessages(taskId, workspaceId, lastSeqRef.current || undefined),
          ]);

          pollFailures.current = 0;
          setConnectionLost(false);
          setActiveTask(task);

          if (tmsgs.length > 0) {
            setTaskMessages((prev) => [...prev, ...tmsgs]);
            lastSeqRef.current = Math.max(
              ...tmsgs.map((m) => m.seq),
              lastSeqRef.current
            );
          }

          if (task.status === "completed" || task.status === "failed") {
            if (pollRef.current) clearInterval(pollRef.current);
            pollRef.current = null;

            try {
              const updatedMessages = await listMessages(conversationId, workspaceId);
              setMessages(updatedMessages);
            } catch {
              toast.error("Failed to refresh messages");
            }
            setActiveTask(null);
            setTaskMessages([]);
          }
        } catch {
          pollFailures.current += 1;
          if (pollFailures.current >= 3) {
            setConnectionLost(true);
          }
          if (pollFailures.current >= 10) {
            if (pollRef.current) clearInterval(pollRef.current);
            pollRef.current = null;
            toast.error("Lost connection to agent");
          }
        }
      }, 1000);
    },
    [conversationId, workspaceId]
  );

  useEffect(() => {
    return () => {
      if (pollRef.current) clearInterval(pollRef.current);
    };
  }, []);

  const handleSend = async () => {
    const content = input.trim();
    if (!content || sending) return;

    setInput("");
    setSending(true);

    const optimistic: Message = {
      id: `temp-${Date.now()}`,
      conversation_id: conversationId,
      role: "user",
      content,
      task_id: null,
      created_at: new Date().toISOString(),
    };
    setMessages((prev) => [...prev, optimistic]);

    try {
      const { message, task } = await sendMessage(conversationId, content, workspaceId);
      setMessages((prev) =>
        prev.map((m) => (m.id === optimistic.id ? message : m))
      );
      setActiveTask(task);
      setTaskMessages([]);
      startPolling(task.id);
    } catch (err) {
      setMessages((prev) => prev.filter((m) => m.id !== optimistic.id));
      setInput(content);
      toast.error(
        err instanceof Error ? err.message : "Failed to send message"
      );
    } finally {
      setSending(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  if (loading) {
    return (
      <div className="flex flex-1 items-center justify-center">
        <Loader2 className="size-5 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!conversation) {
    return (
      <div className="flex flex-1 items-center justify-center text-sm text-muted-foreground">
        Conversation not found
      </div>
    );
  }

  return (
    <>
      {/* Messages */}
      <div className="flex-1 overflow-y-auto px-5" ref={scrollRef}>
        <div className="mx-auto max-w-2xl py-6 space-y-4">
          {messages.length === 0 && !activeTask && (
            <p className="text-center text-muted-foreground py-20 text-sm">
              Send a message to start chatting with the agent.
            </p>
          )}

          {messages.map((msg) => (
            <div
              key={msg.id}
              className={`flex ${msg.role === "user" ? "justify-end" : "justify-start"}`}
            >
              {msg.role === "user" ? (
                <div className="max-w-[80%] rounded-lg px-4 py-2 bg-primary text-primary-foreground whitespace-pre-wrap">
                  {msg.content}
                </div>
              ) : (
                <div className="markdown max-w-full px-1 py-1 text-base text-foreground">
                  <Streamdown>{msg.content}</Streamdown>
                </div>
              )}
            </div>
          ))}

          {activeTask && (
            <div className="rounded-lg border bg-muted/50 p-4 space-y-2">
              <div className="flex items-center gap-2">
                <Badge variant="secondary">
                  {activeTask.status === "running"
                    ? "Agent working..."
                    : activeTask.status}
                </Badge>
              </div>
              {taskMessages.length > 0 && (
                <div className="mt-2 max-h-60 overflow-y-auto rounded-lg bg-muted/30 p-3 font-mono text-xs space-y-1">
                  {taskMessages.map((tm) => (
                    <div key={tm.id} className="text-muted-foreground">
                      {tm.type === "tool-use" && (
                        <span className="text-primary">
                          [tool] {tm.tool}
                        </span>
                      )}
                      {tm.type === "tool-result" && (
                        <span className="text-accent-foreground">
                          [result] {tm.output || tm.content}
                        </span>
                      )}
                      {tm.type === "text" && <span>{tm.content}</span>}
                      {tm.type === "thinking" && (
                        <span className="italic opacity-60">
                          {tm.content}
                        </span>
                      )}
                      {!["tool-use", "tool-result", "text", "thinking"].includes(
                        tm.type
                      ) && (
                        <span>
                          [{tm.type}] {tm.content}
                        </span>
                      )}
                    </div>
                  ))}
                </div>
              )}
              {activeTask.status === "failed" && activeTask.error && (
                <p className="text-sm text-destructive">
                  {activeTask.error}
                </p>
              )}
              {connectionLost && (
                <p className="text-xs text-muted-foreground animate-pulse">
                  Connection lost — retrying...
                </p>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Input */}
      <div className="px-5 py-3">
        <div className="mx-auto max-w-2xl">
          <div
            className={cn(
              "relative flex flex-col rounded-xl border bg-background/60 transition-colors duration-200",
              "focus-within:border-ring focus-within:ring-3 focus-within:ring-ring/50",
              (sending || !!activeTask) && "opacity-50"
            )}
          >
            <textarea
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="Type a message..."
              rows={1}
              disabled={sending || !!activeTask}
              className={cn(
                "field-sizing-content w-full resize-none bg-transparent px-3.5 pt-2.5 text-base outline-none",
                "placeholder:text-muted-foreground disabled:cursor-not-allowed",
                "min-h-[38px] max-h-[200px]"
              )}
            />
            <div className="flex items-center justify-end px-2 pb-2 pt-0.5">
              <Button
                size="icon-sm"
                onClick={handleSend}
                disabled={!input.trim() || sending || !!activeTask}
                className={cn(
                  "rounded-lg transition-opacity duration-200",
                  !input.trim() && "opacity-40"
                )}
              >
                {sending ? (
                  <Loader2 className="size-3.5 animate-spin" />
                ) : (
                  <ArrowUp className="size-3.5" />
                )}
              </Button>
            </div>
          </div>
        </div>
      </div>
    </>
  );
}
