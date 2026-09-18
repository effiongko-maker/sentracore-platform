import type { Metadata } from "next";
import { PlatformFinanceReceiptsPage } from "@/modules/platform-finance/components/PlatformFinanceReceiptsPage";
export const metadata:Metadata={title:"Receipts"};
export default function ReceiptsRoute(){return <PlatformFinanceReceiptsPage/>;}
