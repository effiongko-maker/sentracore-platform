import type { Metadata } from "next";
import { PeopleView } from "@/modules/platform-admin/client/PeopleView";

export const metadata: Metadata = { title: "People" };

export default function Route() {
  return <PeopleView />;
}
