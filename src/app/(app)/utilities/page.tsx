import { redirect } from "next/navigation";

/** Not in the active product surface for demo — keep route from dead-ending. */
export default function UtilitiesPage() {
  redirect("/operations");
}
