import type { Metadata } from "next";
import { UsersPage } from "@/modules/users";

export const metadata: Metadata = {
  title: "Users",
};

export default function UsersRoute() {
  return <UsersPage />;
}
