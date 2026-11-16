import { redirect } from "next/navigation";

/** Старый URL → канонический `/legal/offer`. */
export default function Page() {
  redirect("/legal/offer");
}
