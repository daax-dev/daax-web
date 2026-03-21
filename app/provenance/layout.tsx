import { ReactNode } from "react";

export default function ProvenanceLayout({
  children,
}: {
  children: ReactNode;
}) {
  return (
    <div className="container mx-auto py-6 px-4 max-w-screen-2xl">
      {children}
    </div>
  );
}
