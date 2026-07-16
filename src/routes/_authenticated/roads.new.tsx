import { createFileRoute } from "@tanstack/react-router";
import { PageHeader } from "@/components/PageHeader";
import { RoadWizard } from "@/components/roads/wizard/RoadWizard";

export const Route = createFileRoute("/_authenticated/roads/new")({
  component: NewRoad,
});

function NewRoad() {
  return (
    <div className="p-8 max-w-6xl">
      <PageHeader
        title="New road"
        subtitle="Design a road profile with elevation, curves, surface, and 2D preview."
      />
      <RoadWizard />
    </div>
  );
}
