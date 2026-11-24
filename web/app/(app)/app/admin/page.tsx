import type { Metadata } from "next";
import { PageHeader } from "@/components/app/primitives";
import AdminClient from "@/components/app/AdminClient";

export const metadata: Metadata = { title: "Treasury admin · Harvestia", robots: { index: false } };

export default function AdminPage() {
  return (
    <>
      <PageHeader
        title="Treasury admin"
        subtitle="Milestone releases, refunds and payout distributions, signed by the company treasury wallet on Solana mainnet."
      />
      <AdminClient />
    </>
  );
}
