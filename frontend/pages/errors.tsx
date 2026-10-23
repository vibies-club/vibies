import type { PageData } from "../contracts";
import { ErrorsScreen } from "../errors-screen";
import "../errors.css";

// The demo needs no account data, so the app renders it before the page API answers.
export function ErrorsPage({ search }: { data: PageData; search: URLSearchParams }) {
  const param = search.get("state");
  const state = param === "loading" ? "loading" : param === "error" ? "error" : "results";
  const query = search.get("q") ?? "";
  return <div className="errors-app"><ErrorsScreen initialState={state} initialQuery={query} /></div>;
}
