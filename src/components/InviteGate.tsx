"use client";

/**
 * The very first screen: invite-only. Just the "(Invite Code:)" text above a
 * capsule password field — Comic Sans, black & white, nothing else.
 * Enter submits; a wrong code shakes and clears.
 */
import { useEffect, useRef, useState } from "react";

const INVITE_CODE = "dioshitsonstick";
export const INVITE_KEY = "ssa-invite-ok";

export function isInvited(): boolean {
  try {
    return localStorage.getItem(INVITE_KEY) === "ok";
  } catch {
    return false;
  }
}

export function markInvited(): void {
  try {
    localStorage.setItem(INVITE_KEY, "ok");
  } catch {
    /* ignore */
  }
}

export function InviteGate({ onSuccess }: { onSuccess: () => void }) {
  const [value, setValue] = useState("");
  const [wrong, setWrong] = useState(false);
  const timer = useRef<number | undefined>(undefined);

  useEffect(() => () => window.clearTimeout(timer.current), []);

  const submit = () => {
    if (value.trim().toLowerCase() === INVITE_CODE) {
      markInvited();
      onSuccess();
      return;
    }
    setWrong(false);
    // restart the shake animation, then clear the field
    requestAnimationFrame(() => setWrong(true));
    window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => {
      setWrong(false);
      setValue("");
    }, 500);
  };

  return (
    <div className="crt-bg fixed inset-0 flex flex-col items-center justify-center gap-5 select-none bg-black font-comic">
      <div className="text-xl sm:text-2xl text-white">(Invite Code:)</div>
      <input
        type="password"
        autoFocus
        autoComplete="off"
        spellCheck={false}
        value={value}
        onChange={(e) => setValue(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            e.preventDefault();
            submit();
          }
        }}
        aria-label="Invite code"
        className={`h-12 w-64 max-w-[80vw] rounded-full border-2 bg-black px-6 text-center text-lg tracking-widest text-white outline-none transition-colors duration-200 ${
          wrong ? "ssa-shake border-white" : "border-white/50 focus:border-white"
        }`}
      />
    </div>
  );
}
