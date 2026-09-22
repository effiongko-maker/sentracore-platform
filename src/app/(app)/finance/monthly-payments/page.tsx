import type { Metadata } from "next";
import "@/styles/finance.css";
import { MonthlyContractPaymentsPage } from "@/modules/finance/components/MonthlyContractPaymentsPage";

export const metadata: Metadata = {
  title: "Monthly contract payments",
};

export default function MonthlyContractPaymentsRoute() {
  return <MonthlyContractPaymentsPage />;
}
