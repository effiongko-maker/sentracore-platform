import { type LucideIcon } from "lucide-react";
import {
  ExploreHeader,
  ModeFrame,
  StreamSurface,
} from "@/components/platform";
import { EmptyState } from "@/components/ui/EmptyState";

interface ModulePlaceholderProps {
  title: string;
  description: string;
  icon: LucideIcon;
  moduleName: string;
}

export function ModulePlaceholder({
  title,
  description,
  icon,
  moduleName,
}: ModulePlaceholderProps) {
  return (
    <ModeFrame mode="organise">
      <ExploreHeader title={title} description={description} />
      <StreamSurface>
        <EmptyState
          icon={icon}
          title={`${moduleName} is not enabled yet`}
          description="This area is reserved for future facility operations capability. It is connected to navigation and will open when the module is activated."
          className="border-0 bg-transparent py-12"
        />
      </StreamSurface>
    </ModeFrame>
  );
}
