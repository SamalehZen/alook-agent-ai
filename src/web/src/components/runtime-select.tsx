"use client";

import type { Runtime } from "@/lib/api";
import {
  Select,
  SelectTrigger,
  SelectValue,
  SelectPopup,
  SelectItem,
  SelectGroup,
  SelectGroupLabel,
} from "@/components/ui/select";

interface RuntimeSelectProps {
  value: string;
  onValueChange: (value: string) => void;
  runtimes: Runtime[];
  disabled?: boolean;
}

function groupRuntimes(runtimes: Runtime[]) {
  const groups = new Map<string, { label: string; runtimes: Runtime[] }>();
  for (const rt of runtimes) {
    const key = rt.daemon_id || rt.id;
    if (!groups.has(key)) {
      groups.set(key, {
        label:
          (typeof rt.device_info === "string" ? rt.device_info : "") ||
          rt.name ||
          key,
        runtimes: [],
      });
    }
    groups.get(key)!.runtimes.push(rt);
  }
  return groups;
}

function getPlaceholder(runtimes: Runtime[]) {
  if (runtimes.length === 0) return "No runtimes — start a daemon first";
  if (runtimes.every((r) => r.status !== "online")) return "All runtimes offline";
  return "Select a runtime";
}

export function RuntimeSelect({
  value,
  onValueChange,
  runtimes,
  disabled,
}: RuntimeSelectProps) {
  const groups = groupRuntimes(runtimes);
  const allDisabled =
    disabled ||
    runtimes.length === 0 ||
    runtimes.every((r) => r.status !== "online");

  return (
    <Select
      value={value}
      onValueChange={(val: string | null) => {
        if (val) onValueChange(val);
      }}
      disabled={allDisabled}
      items={runtimes.map((rt) => {
        const machine =
          (typeof rt.device_info === "string" ? rt.device_info : "") ||
          rt.name ||
          "";
        const label = machine ? `${rt.provider} (${machine})` : rt.provider;
        return { value: rt.id, label };
      })}
    >
      <SelectTrigger>
        <SelectValue placeholder={getPlaceholder(runtimes)} />
      </SelectTrigger>
      <SelectPopup portal={false}>
        {Array.from(groups.entries()).map(([key, group]) => (
          <SelectGroup key={key}>
            <SelectGroupLabel className="truncate">
              {group.label}
            </SelectGroupLabel>
            {group.runtimes.map((rt) => (
              <SelectItem
                key={rt.id}
                value={rt.id}
                disabled={rt.status !== "online"}
              >
                <span className="flex items-center gap-2">
                  <span>{rt.provider}</span>
                  <span className="text-muted-foreground text-xs">
                    ({rt.status})
                  </span>
                </span>
              </SelectItem>
            ))}
          </SelectGroup>
        ))}
      </SelectPopup>
    </Select>
  );
}
