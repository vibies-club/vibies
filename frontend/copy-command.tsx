"use client";

import { useEffect, useState } from "react";

export function CopyCommand({ command }: { command: string }) {
  const [ready, setReady] = useState(false);
  const [message, setMessage] = useState("");
  useEffect(() => setReady(true), []);

  async function copy() {
    try {
      await navigator.clipboard.writeText(command);
      setMessage("Command copied.");
    } catch {
      setMessage("Could not copy. Select the command text and copy it manually.");
    }
  }

  return <div className="wiki-copy">
    <button type="button" className="secondary" disabled={!ready} onClick={copy}>Copy command</button>
    <span className="wiki-copy-status" role="status">{message}</span>
  </div>;
}
