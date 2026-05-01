"use client";

import { useState } from "react";
import {
  Dialog,
  DialogTrigger,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { type AvatarConfig, AvatarRenderer } from "./avatar-parts";
import { AvatarGenerator } from "./avatar-generator";

interface AvatarPickerDialogProps {
  config: AvatarConfig;
  onChange: (config: AvatarConfig) => void;
}

export function AvatarPickerDialog({ config, onChange }: AvatarPickerDialogProps) {
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState<AvatarConfig>(config);

  return (
    <Dialog
      open={open}
      onOpenChange={(nextOpen) => {
        if (nextOpen) setDraft(config);
        setOpen(nextOpen);
      }}
    >
      <div className="flex justify-center">
        <DialogTrigger
          render={
            <button
              type="button"
              className="rounded-2xl bg-background p-1.5 shadow-sm border border-border hover:border-primary/40 transition-colors cursor-pointer"
            />
          }
        >
          <AvatarRenderer config={config} size={80} />
        </DialogTrigger>
      </div>

      <DialogContent className="sm:max-w-[720px]">
        <DialogHeader>
          <DialogTitle>Choose Avatar</DialogTitle>
        </DialogHeader>
        <AvatarGenerator
          config={draft}
          layout="horizontal"
          onChange={(next) => {
            setDraft(next);
            onChange(next);
          }}
        />
      </DialogContent>
    </Dialog>
  );
}
