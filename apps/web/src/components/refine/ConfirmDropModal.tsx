"use client";

import React, { useState } from "react";
import { AlertTriangle } from "lucide-react";

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";

export interface ConfirmDropModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  droppedRequirements: string[];
  onConfirm: () => void;
  isLoading?: boolean;
}

/**
 * ConfirmDropModal: Prompts user when accepting a patch that removes rules protecting stated requirements.
 *
 * Requirements (BUILD_PLAN.md:536):
 * - Shows a red box listing each requirement that will stop being checked.
 * - Checkbox with exact text: "I understand this requirement will no longer be checked."
 * - Confirm button remains disabled until the checkbox is checked.
 * - Cancel button closes the modal.
 * - Plain text rendering only (no dangerouslySetInnerHTML).
 */
export function ConfirmDropModal({
  open,
  onOpenChange,
  droppedRequirements,
  onConfirm,
  isLoading = false,
}: ConfirmDropModalProps): React.ReactElement {
  const [isChecked, setIsChecked] = useState(false);

  const handleOpenChange = (nextOpen: boolean) => {
    if (!nextOpen) {
      setIsChecked(false);
    }
    onOpenChange(nextOpen);
  };

  const handleConfirm = () => {
    if (isChecked && !isLoading) {
      onConfirm();
    }
  };

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent
        className="sm:max-w-md bg-card border-border text-foreground"
        aria-describedby="confirm-drop-desc"
      >
        <DialogHeader>
          <div className="flex items-center gap-2 text-rose-500">
            <AlertTriangle className="size-5 shrink-0" aria-hidden="true" />
            <DialogTitle className="text-base font-semibold">
              Requirement Check Removal
            </DialogTitle>
          </div>
          <DialogDescription id="confirm-drop-desc" className="text-xs text-muted-foreground pt-1">
            Applying this change removes rules that were verifying one or more requirements.
          </DialogDescription>
        </DialogHeader>

        {/* Red box listing each requirement that will stop being checked */}
        <div
          className="rounded-lg border border-rose-500/30 bg-rose-950/20 p-4 space-y-2 text-xs text-rose-200"
          role="region"
          aria-label="Requirements that will no longer be checked"
        >
          <p className="font-semibold text-rose-400">
            The following requirements will no longer be verified by checks:
          </p>
          <ul className="list-disc pl-4 space-y-1">
            {droppedRequirements.map((req, idx) => (
              <li key={idx} className="break-words">
                {req}
              </li>
            ))}
          </ul>
        </div>

        {/* Checkbox with exact text from BUILD_PLAN.md:536 */}
        <div className="flex items-start gap-2.5 pt-2">
          <input
            id="drop-ack-checkbox"
            type="checkbox"
            checked={isChecked}
            onChange={(e) => setIsChecked(e.target.checked)}
            disabled={isLoading}
            className="mt-0.5 size-4 rounded border-border bg-background text-rose-500 focus:ring-2 focus:ring-rose-500 focus:ring-offset-background cursor-pointer disabled:cursor-not-allowed"
          />
          <label
            htmlFor="drop-ack-checkbox"
            className="text-xs font-medium leading-none text-foreground cursor-pointer select-none"
          >
            I understand this requirement will no longer be checked.
          </label>
        </div>

        <DialogFooter className="gap-2 sm:gap-0 pt-4 border-t border-border/40">
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={() => handleOpenChange(false)}
            disabled={isLoading}
            className="text-xs font-mono"
          >
            Cancel
          </Button>
          <Button
            type="button"
            variant="destructive"
            size="sm"
            onClick={handleConfirm}
            disabled={!isChecked || isLoading}
            className="text-xs font-mono"
          >
            {isLoading ? "Applying..." : "Confirm & Accept"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

