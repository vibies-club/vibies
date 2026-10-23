export type WikiEntry = {
  id: string;
  title: string;
  topic: string;
  where: "shell" | "tmux" | "Codex" | "SQL Editor" | "browser";
  command?: string;
  keys?: string;
  usage: string;
  prerequisites: string;
  placeholders?: string;
  result: string;
  sources: { file: string; location: string }[];
  guide?: { label: string; href: string };
};

// ponytail: kept apart from wikiEntries so the client bundle never carries the private wiki content.
export function filterEntries(entries: WikiEntry[], query: string, topic: string): WikiEntry[] {
  const words = query.trim().toLowerCase();
  const selectedTopic = topic.trim();

  return entries.filter((entry) =>
    (!selectedTopic || entry.topic === selectedTopic) &&
    (!words || [entry.title, entry.command, entry.keys, entry.usage, entry.prerequisites, entry.placeholders, entry.result]
      .some((value) => value?.toLowerCase().includes(words))),
  );
}
