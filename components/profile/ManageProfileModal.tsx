"use client";

import { useRef, useState, useTransition } from "react";

import { Button } from "@/components/ui/Button";
import { Field, TextInput } from "@/components/ui/Field";
import { removeMyAvatar, updateMyName } from "@/lib/profile/actions";
import { uploadAvatar } from "@/lib/profile/upload-client";

import { Avatar } from "./Avatar";

function CameraIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} className={className}>
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M6.827 6.175A2.31 2.31 0 0 1 8.926 4.5h6.148c.891 0 1.713.663 2.1 1.675l.221.62c.115.32.427.549.79.549h.415A2.25 2.25 0 0 1 20.85 9.6v7.65a2.25 2.25 0 0 1-2.25 2.25H5.4a2.25 2.25 0 0 1-2.25-2.25V9.6a2.25 2.25 0 0 1 2.25-2.25h.415c.364 0 .676-.229.79-.549l.222-.626Z"
      />
      <path strokeLinecap="round" strokeLinejoin="round" d="M15 13.5a3 3 0 1 1-6 0 3 3 0 0 1 6 0Z" />
    </svg>
  );
}

// Shared "manage profile" modal — same shape used by every signed-in
// surface (client portal, dashboard, factory, graphics), each opening it
// from its own header/user-menu with its own current name/avatar. Both
// fields save independently (photo uploads the instant it's picked, same
// as every other upload in this app — see AddMediaButton) rather than a
// single combined "Save" for the whole form.
export function ManageProfileModal({
  open,
  onClose,
  name,
  avatarUrl,
  onSaved,
}: {
  open: boolean;
  onClose: () => void;
  name: string;
  avatarUrl: string | null;
  // Called after any successful change (photo or name) — callers typically
  // router.refresh() so the rest of the page (e.g. the user menu itself)
  // picks up the fresh session data.
  onSaved: () => void;
}) {
  const [nameInput, setNameInput] = useState(name);
  const [currentAvatar, setCurrentAvatar] = useState(avatarUrl);
  const [nameSaved, setNameSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [uploadProgress, setUploadProgress] = useState<number | null>(null);
  const [pending, start] = useTransition();
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Re-sync from the latest props each time the modal opens — otherwise a
  // second open still shows whatever was typed/uploaded last time it closed.
  // Adjusted during render (React's documented pattern for this — see "you
  // might not need an effect") rather than in a useEffect, since the modal
  // never unmounts between opens (it just returns null while closed) so
  // there's no natural point for an effect to re-sync from.
  const [wasOpen, setWasOpen] = useState(open);
  if (open !== wasOpen) {
    setWasOpen(open);
    if (open) {
      setNameInput(name);
      setCurrentAvatar(avatarUrl);
      setNameSaved(false);
      setError(null);
      setUploadProgress(null);
    }
  }

  if (!open) return null;

  function saveName() {
    setError(null);
    setNameSaved(false);
    start(async () => {
      const res = await updateMyName(nameInput);
      if (!res.ok) {
        setError(res.error);
        return;
      }
      setNameSaved(true);
      onSaved();
    });
  }

  function pickPhoto() {
    fileInputRef.current?.click();
  }

  function onFileChosen(file: File | undefined) {
    if (!file) return;
    setError(null);
    setUploadProgress(0);
    start(async () => {
      const res = await uploadAvatar(file, setUploadProgress);
      setUploadProgress(null);
      if (!res.ok) {
        setError(res.error);
        return;
      }
      setCurrentAvatar(res.url);
      onSaved();
    });
  }

  function removePhoto() {
    setError(null);
    start(async () => {
      const res = await removeMyAvatar();
      if (!res.ok) {
        setError(res.error);
        return;
      }
      setCurrentAvatar(null);
      onSaved();
    });
  }

  return (
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center bg-gray-400/50 p-4 backdrop-blur-[2px] dark:bg-gray-950/60"
      onClick={() => !pending && onClose()}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Manage profile"
        className="w-full max-w-sm rounded-[var(--radius)] border border-border bg-surface p-6 shadow-theme-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-2">
          <h3 className="text-base font-semibold">Manage profile</h3>
          <button
            type="button"
            onClick={onClose}
            disabled={pending}
            aria-label="Close"
            className="text-lg text-muted hover:text-foreground disabled:opacity-50"
          >
            ✕
          </button>
        </div>

        <div className="mt-4 flex flex-col items-center gap-2">
          <button
            type="button"
            onClick={pickPhoto}
            disabled={pending}
            className="group relative"
            aria-label="Change profile picture"
          >
            <Avatar url={currentAvatar} name={nameInput || name} sizeClassName="h-20 w-20 text-2xl" />
            <span className="absolute inset-0 flex items-center justify-center rounded-full bg-black/0 opacity-0 transition-opacity group-hover:bg-black/40 group-hover:opacity-100">
              <CameraIcon className="h-6 w-6 text-white" />
            </span>
          </button>
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            className="sr-only"
            onChange={(e) => onFileChosen(e.target.files?.[0])}
          />
          <div className="flex items-center gap-3 text-xs">
            <button
              type="button"
              onClick={pickPhoto}
              disabled={pending}
              className="font-medium text-brand-600 hover:underline disabled:opacity-50"
            >
              {currentAvatar ? "Change photo" : "Add photo"}
            </button>
            {currentAvatar ? (
              <button
                type="button"
                onClick={removePhoto}
                disabled={pending}
                className="font-medium text-muted hover:text-error-600 disabled:opacity-50"
              >
                Remove
              </button>
            ) : null}
          </div>
          {uploadProgress != null ? (
            <div className="h-1 w-full overflow-hidden rounded-full bg-background">
              <div
                className="h-full bg-brand-500 transition-[width]"
                style={{ width: `${Math.round(uploadProgress * 100)}%` }}
              />
            </div>
          ) : null}
        </div>

        <form
          className="mt-5 space-y-3"
          onSubmit={(e) => {
            e.preventDefault();
            saveName();
          }}
        >
          <Field label="Display name">
            <TextInput
              value={nameInput}
              onChange={(e) => {
                setNameInput(e.target.value);
                setNameSaved(false);
              }}
              required
              maxLength={100}
            />
          </Field>
          {error ? <p className="text-sm text-[var(--rush)]">{error}</p> : null}
          {nameSaved && !error ? <p className="text-sm text-success-600">Saved.</p> : null}
          <Button
            variant="primary"
            type="submit"
            className="w-full"
            loading={pending}
            disabled={pending || !nameInput.trim() || nameInput.trim() === name}
          >
            Save name
          </Button>
        </form>
      </div>
    </div>
  );
}
