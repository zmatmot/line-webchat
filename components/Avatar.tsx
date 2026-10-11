"use client";

import { useState } from "react";

interface AvatarProps {
  name: string;
  pictureUrl: string;
  /** Tailwind size classes, e.g. "h-12 w-12". */
  className?: string;
}

function AvatarImage({ name, pictureUrl, className }: Required<AvatarProps>) {
  const [failed, setFailed] = useState(false);

  if (!pictureUrl || failed) {
    return (
      <div
        aria-hidden
        className={`${className} flex shrink-0 items-center justify-center rounded-full bg-slate-300 font-semibold text-white`}
      >
        {name.trim().charAt(0).toUpperCase() || "?"}
      </div>
    );
  }

  return (
    // A plain <img>: LINE profile pictures are already small CDN images, so
    // the Next.js image optimizer would only add cost and remotePatterns config.
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={pictureUrl}
      alt=""
      referrerPolicy="no-referrer"
      onError={() => setFailed(true)}
      className={`${className} shrink-0 rounded-full bg-slate-200 object-cover`}
    />
  );
}

export function Avatar({
  name,
  pictureUrl,
  className = "h-12 w-12",
}: AvatarProps) {
  // Keyed by URL so a failed load does not stick after the picture changes.
  return (
    <AvatarImage
      key={pictureUrl}
      name={name}
      pictureUrl={pictureUrl}
      className={className}
    />
  );
}
