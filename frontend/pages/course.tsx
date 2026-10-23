import type { PageData } from "../contracts";
import { AppShell } from "../app-shell";
import { EmptyState, PageHeader } from "../ui";

// ponytail: placeholders so the routes exist now; the course, gates and collaborate PRs replace these bodies.
function Stub({ data, title, text = "Course pages are on the way." }: { data: PageData; title: string; text?: string }) {
  return <AppShell data={data}>
    <PageHeader title={title} />
    <EmptyState href="/welcome" action="Back to Home">{text}</EmptyState>
  </AppShell>;
}

export function CoursePage({ data }: { data: PageData; search: URLSearchParams }) {
  return <Stub data={data} title="Course" />;
}

export function SessionPage({ data }: { data: PageData; search: URLSearchParams }) {
  return <Stub data={data} title={`Session ${window.location.pathname.slice("/course/".length)}`} />;
}

export function CollaboratePage({ data }: { data: PageData; search: URLSearchParams }) {
  return <Stub data={data} title="Collaborate" text="Collaboration is on the way." />;
}

export function GatesPage({ data }: { data: PageData; search: URLSearchParams }) {
  return <Stub data={data} title="Gates" />;
}
