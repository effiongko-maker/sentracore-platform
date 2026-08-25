import { redirect } from "next/navigation";

/** Legacy route — Platform Home lives at `/`. */
export default function PlatformPage() {
  redirect("/");
}
