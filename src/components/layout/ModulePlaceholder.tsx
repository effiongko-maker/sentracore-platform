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
            title={`${moduleName} is not enabled yet`}
            description="This area is reserved for future facility operations capability. It is connected to navigation and will open when the module is activated."
            className="border-0 bg-transparent"
          />
        </CardContent>
      </Card>
    </div>
  );
}
