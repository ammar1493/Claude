import type { Metadata } from "next";
import { IncentiveVerifier } from "@/components/incentives/IncentiveVerifier";

export const metadata: Metadata = {
  title: "Incentive Verification | NEFT Training Analytics",
  description:
    "Check trainers' incentive sheets against the monthly record sheet and the course duration list.",
};

export default function Page() {
  return <IncentiveVerifier />;
}
