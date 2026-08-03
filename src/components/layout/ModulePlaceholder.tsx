import { type LucideIcon } from "lucide-react";
import { PageHeader } from "@/components/ui/PageHeader";
import { EmptyState } from "@/components/ui/EmptyState";
import { Card, CardContent } from "@/components/ui/Card";

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
    <div>
      <PageHeader title={title} description={description} />
      <Card>
        <CardContent className="py-4">
          <EmptyState
            icon={icon}
            title={`${moduleName} module is ready for build-out`}
            description="This route is wired into the shell and navigation. Connect its service layer and screens when the module is prioritized."
            className="border-0 bg-transparent"
          />
        </CardContent>
      </Card>
    </div>
  );
}
