import type { PageData } from "../contracts";
import { ErrorsScreen } from "../../app/errors/errors-screen";
import "../../app/errors/errors.css";

// The demo needs no account data; the page API call only confirms the route.
export function ErrorsPage({ search }: { data: PageData; search: URLSearchParams }) {
  const param = search.get("state");
  const state = param === "loading" ? "loading" : param === "error" ? "error" : "results";
  const query = search.get("q") ?? "";
  return <div className="errors-app"><ErrorsScreen initialState={state} initialQuery={query} /></div>;
}
