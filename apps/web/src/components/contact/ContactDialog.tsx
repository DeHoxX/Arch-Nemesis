"use client";

import React, { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { AlertCircle, CheckCircle2 } from "lucide-react";

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { postLead } from "@/lib/api";
import { LEAD_NOTE_MAX_CHARS } from "@/lib/types";

export const contactFormSchema = z.object({
  name: z
    .string()
    .trim()
    .min(1, "Name is required.")
    .max(100, "Name must be 100 characters or less."),
  email: z
    .string()
    .trim()
    .min(1, "Email is required.")
    .email("Please enter a valid email address.")
    .max(254, "Email must be 254 characters or less."),
  note: z
    .string()
    .max(LEAD_NOTE_MAX_CHARS, `Note must be ${LEAD_NOTE_MAX_CHARS} characters or less.`),
  website: z.string(),
});

export type ContactFormData = z.infer<typeof contactFormSchema>;

export interface ContactDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  designId?: string;
  versionNo?: number;
}

export function ContactDialog({
  open,
  onOpenChange,
  designId,
  versionNo,
}: ContactDialogProps): React.ReactElement {
  const [isSuccess, setIsSuccess] = useState(false);
  const [apiError, setApiError] = useState<string | null>(null);

  const isDesignLoaded = Boolean(designId && versionNo && versionNo >= 1);

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
    reset,
  } = useForm<ContactFormData>({
    resolver: zodResolver(contactFormSchema),
    defaultValues: {
      name: "",
      email: "",
      note: "",
      website: "",
    },
  });

  const handleDialogClose = (newOpen: boolean) => {
    if (!newOpen) {
      // Clear transient messages on close
      setApiError(null);
      if (isSuccess) {
        setIsSuccess(false);
        reset();
      }
    }
    onOpenChange(newOpen);
  };

  const onSubmit = async (data: ContactFormData) => {
    if (!isDesignLoaded || !designId || !versionNo) {
      return;
    }

    setApiError(null);

    try {
      await postLead({
        design_id: designId,
        version_no: versionNo,
        name: data.name,
        email: data.email,
        note: data.note ? data.note.trim() || null : null,
        website: data.website ? data.website.trim() || null : null,
      });
      setIsSuccess(true);
    } catch (err: unknown) {
      if (err instanceof Error) {
        setApiError(err.message);
      } else {
        setApiError("Something went wrong on our side.");
      }
      // Note: form inputs are preserved on error, never reset
    }
  };

  return (
    <Dialog open={open} onOpenChange={handleDialogClose}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Contact our team</DialogTitle>
          <DialogDescription>
            {isDesignLoaded
              ? `We will follow up about Design ${designId} (v${versionNo}).`
              : "Design specification is not loaded yet."}
          </DialogDescription>
        </DialogHeader>

        {isSuccess ? (
          <div className="space-y-4 py-4" data-testid="contact-success-state">
            <div className="flex items-center gap-2 text-emerald-700 dark:text-emerald-400">
              <CheckCircle2 className="size-5 shrink-0" />
              <p className="text-sm font-medium text-foreground">
                Thanks. Our team will contact you about this design.
              </p>
            </div>
            <div className="pt-2 flex justify-end">
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => handleDialogClose(false)}
              >
                Close
              </Button>
            </div>
          </div>
        ) : (
          <form onSubmit={handleSubmit(onSubmit)} className="space-y-4" noValidate>
            {!isDesignLoaded && (
              <p className="text-xs text-amber-700 dark:text-amber-400">
                Design specification is not loaded yet.
              </p>
            )}

            {apiError && (
              <Alert variant="destructive" className="py-2.5">
                <AlertCircle className="size-4" />
                <AlertTitle className="text-xs font-semibold">Submission failed</AlertTitle>
                <AlertDescription className="text-xs">{apiError}</AlertDescription>
              </Alert>
            )}

            {/* Honeypot field: visually hidden, excluded from tab order and screen readers */}
            <div className="sr-only" aria-hidden="true">
              <label htmlFor="website">Website</label>
              <input
                id="website"
                type="text"
                tabIndex={-1}
                autoComplete="off"
                aria-hidden="true"
                {...register("website")}
              />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="lead-name">Name</Label>
              <Input
                id="lead-name"
                type="text"
                placeholder="Your name"
                disabled={isSubmitting || !isDesignLoaded}
                aria-invalid={Boolean(errors.name)}
                {...register("name")}
              />
              {errors.name && (
                <p className="text-xs text-destructive">{errors.name.message}</p>
              )}
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="lead-email">Email</Label>
              <Input
                id="lead-email"
                type="email"
                placeholder="you@example.com"
                disabled={isSubmitting || !isDesignLoaded}
                aria-invalid={Boolean(errors.email)}
                {...register("email")}
              />
              {errors.email && (
                <p className="text-xs text-destructive">{errors.email.message}</p>
              )}
            </div>

            <div className="space-y-1.5">
              <div className="flex items-center justify-between">
                <Label htmlFor="lead-note">Note (optional)</Label>
                <span className="text-xs text-muted-foreground font-mono">
                  max {LEAD_NOTE_MAX_CHARS}
                </span>
              </div>
              <Textarea
                id="lead-note"
                placeholder="Any questions or specific context for our team..."
                disabled={isSubmitting || !isDesignLoaded}
                aria-invalid={Boolean(errors.note)}
                {...register("note")}
              />
              {errors.note && (
                <p className="text-xs text-destructive">{errors.note.message}</p>
              )}
            </div>

            {/* Consent text: Informational text directly above the Send button */}
            <div className="pt-1">
              <p className="text-xs text-muted-foreground leading-relaxed">
                We use your name, email and note only to contact you about this design. We do not share them.
              </p>
            </div>

            <div className="flex justify-end gap-2 pt-2">
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => handleDialogClose(false)}
                disabled={isSubmitting}
              >
                Cancel
              </Button>
              <Button
                type="submit"
                size="sm"
                disabled={isSubmitting || !isDesignLoaded}
              >
                {isSubmitting ? "Sending..." : "Send"}
              </Button>
            </div>
          </form>
        )}
      </DialogContent>
    </Dialog>
  );
}

