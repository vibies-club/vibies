export type DemoError = {
  id: string;
  title: string;
  tool: string;
  error: string;
  location: string;
  cause: string;
  steps: string[];
  confirmation: string;
};

export const demoErrors: DemoError[] = [
  {
    id: "prompt-in-shell",
    title: "Prompt entered in the shell",
    tool: "Codex",
    error: "zsh: no matches found: repository?",
    location: "Shell prompt in the project terminal",
    cause: "The prompt was entered in the shell before Codex was open.",
    steps: [
      "Run codex in the terminal.",
      "Wait for the Codex input box.",
      "Enter your prompt there.",
    ],
    confirmation: "Codex responds to your prompt.",
  },
  {
    id: "not-a-git-repository",
    title: "Not a Git repository",
    tool: "Git",
    error: "fatal: not a git repository (or any of the parent directories): .git",
    location: "Terminal",
    cause: "The terminal is outside the project checkout, so Git cannot find the repository metadata.",
    steps: [
      "Run pwd to check the current folder.",
      "Change to the root folder of your cloned project.",
      "Run git status again from that folder.",
    ],
    confirmation: "Git prints the current branch and the working tree status.",
  },
  {
    id: "command-not-found",
    title: "Command not found",
    tool: "Terminal",
    error: "zsh: command not found: npm",
    location: "Terminal",
    cause: "npm is missing or the current terminal session cannot find the Node.js installation on its PATH.",
    steps: [
      "Run node --version to check whether Node.js is available.",
      "If Node.js is missing, install the version required by the project, then open a new terminal.",
      "Run npm --version to confirm that npm is available.",
    ],
    confirmation: "Both node --version and npm --version print version numbers.",
  },
  {
    id: "missing-dev-script",
    title: "Missing script: dev",
    tool: "npm",
    error: "npm error Missing script: \"dev\"",
    location: "Project terminal",
    cause: "The command was run outside the project root, or the current project does not define a dev script.",
    steps: [
      "Change to the project root folder.",
      "Run npm run to list the scripts available in that project.",
      "If dev is listed, run npm run dev. If it is missing, follow the project setup guide or ask the instructor before changing scripts.",
    ],
    confirmation: "The development server starts and prints a local address.",
  },
  {
    id: "port-already-in-use",
    title: "Port already in use",
    tool: "Local server",
    error: "Error: listen EADDRINUSE: address already in use :::3000",
    location: "Local development server",
    cause: "Another local server is already listening on port 3000, often in a different terminal window.",
    steps: [
      "Check your other terminal windows for a server you started earlier.",
      "If that is your old server, stop it with Ctrl+C in that terminal.",
      "If both servers need to run, start this one on another port with npm run dev -- --port 3001.",
    ],
    confirmation: "The server starts and prints the address for its available port.",
  },
];

export function searchDemoErrors(query: string): DemoError[] {
  const terms = query.toLowerCase().trim().split(/\s+/).filter(Boolean);
  if (!terms.length) return demoErrors;

  return demoErrors.filter((item) => {
    const text = [item.id, item.title, item.tool, item.error, item.location, item.cause, ...item.steps, item.confirmation]
      .join(" ")
      .toLowerCase();
    return terms.every((term) => text.includes(term));
  });
}
