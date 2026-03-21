"use client";

import { useRouter } from "next/navigation";
import { BuildWizard } from "@/components/catalog";
import { useBuilds } from "@/hooks/use-catalog";
import type { BuildSpec } from "@/types/catalog";

export default function NewBuildPage() {
  const router = useRouter();
  const { createBuild } = useBuilds();

  const handleComplete = async (
    spec: Omit<BuildSpec, "id" | "createdAt" | "updatedAt">,
  ) => {
    try {
      const created = await createBuild(spec);
      router.push(`/catalog/builds/${created.id}`);
    } catch (error) {
      console.error("Failed to create build:", error);
      alert("Failed to create build spec");
    }
  };

  const handleCancel = () => {
    router.push("/catalog/builds");
  };

  return (
    <div className="max-w-4xl mx-auto">
      <h1 className="text-2xl font-bold mb-6">Create Build Specification</h1>
      <BuildWizard onComplete={handleComplete} onCancel={handleCancel} />
    </div>
  );
}
