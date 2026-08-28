import {
  AlertTriangle,
  BarChart3,
  Building2,
  ClipboardList,
  Database,
  FileBarChart2,
  FileCheck2,
  Inbox,
  MessageSquarePlus,
  Package,
  ScanSearch,
  Users,
  Wrench,
  type LucideIcon,
} from "lucide-react";
import type { AuthEnabledModule } from "@/lib/auth/types";
import type { PlatformModuleSlug } from "@/lib/actions/types";
import { hasModule } from "@/lib/actions/moduleAccess";

export type OperatingLayerId =
  | "understand"
  | "organise"
  | "act"
  | "execute"
  | "learn";

export interface LayerModule {
  label: string;
  href: string;
  icon: LucideIcon;
  title: string;
  description: string;
  moduleSlug?: PlatformModuleSlug;
  comingSoon?: boolean;
}

export interface OperatingLayer {
  id: OperatingLayerId;
  /** Visible navigation group name — natural product language */
  label: string;
  modules: LayerModule[];
}

const FM_MODULE: PlatformModuleSlug = "facility_management";

function fm(partial: Omit<LayerModule, "moduleSlug">): LayerModule {
  return { moduleSlug: FM_MODULE, ...partial };
}

export const OPERATING_LAYERS: OperatingLayer[] = [
  {
    id: "understand",
    label: "Intelligence",
    modules: [
      fm({
        label: "Intelligence",
        href: "/intelligence",
        icon: ScanSearch,
        title: "Intelligence",
        description: "What the organisation is telling you",
      }),
      fm({
        label: "Dashboard",
        href: "/dashboards",
        icon: BarChart3,
        title: "Dashboard",
        description: "Current operational state",
      }),
      fm({
        label: "Reports",
        href: "/reports",
        icon: FileBarChart2,
        title: "Reports",
        description: "Share operational reports",
      }),
    ],
  },
  {
    id: "organise",
    label: "Organisation",
    modules: [
      fm({
        label: "Facilities",
        href: "/facilities",
        icon: Building2,
        title: "Facilities",
        description: "Sites and locations",
      }),
      fm({
        label: "Assets",
        href: "/assets",
        icon: Package,
        title: "Assets",
        description: "Equipment and infrastructure",
      }),
      fm({
        label: "People",
        href: "/users",
        icon: Users,
        title: "People",
        description: "Roles and access",
      }),
      fm({
        label: "Master Data",
        href: "/master-data",
        icon: Database,
        title: "Master Data",
        description: "Reference structure",
      }),
    ],
  },
  {
    id: "act",
    label: "Work",
    modules: [
      fm({
        label: "Submit request",
        href: "/occupant-requests",
        icon: MessageSquarePlus,
        title: "Submit request",
        description: "Report a need or incident",
      }),
      fm({
        label: "Request Queue",
        href: "/requests",
        icon: Inbox,
        title: "Request Queue",
        description: "Incoming reports for review",
      }),
      fm({
        label: "Maintenance",
        href: "/maintenance",
        icon: Wrench,
        title: "Maintenance",
        description: "Maintenance in progress",
      }),
      fm({
        label: "Work Orders",
        href: "/work-orders",
        icon: ClipboardList,
        title: "Work Orders",
        description: "Work moving through the organisation",
      }),
      fm({
        label: "Approvals",
        href: "/approvals",
        icon: FileCheck2,
        title: "Approvals",
        description: "Client authorisation to proceed",
      }),
    ],
  },
  {
    id: "execute",
    label: "Operations",
    modules: [
      fm({
        label: "Incidents",
        href: "/incidents",
        icon: AlertTriangle,
        title: "Incidents",
        description: "Active operational events",
      }),
    ],
  },
];

export const COMMAND_HOME = {
  label: "Home",
  href: "/operations",
};

export function filterOperatingLayers(
  layers: OperatingLayer[],
  enabledModules: AuthEnabledModule[] | null
): OperatingLayer[] {
  if (!enabledModules) return layers;

  return layers
    .map((layer) => ({
      ...layer,
      modules: layer.modules.filter(
        (mod) =>
          mod.comingSoon ||
          !mod.moduleSlug ||
          hasModule(enabledModules, mod.moduleSlug)
      ),
    }))
    .filter((layer) => layer.modules.length > 0);
}

export function resolveLayerByPath(
  pathname: string
): OperatingLayerId | "command" | "platform" {
  if (pathname === "/" || pathname.startsWith("/workspaces")) {
    return "platform";
  }
  if (pathname === "/operations" || pathname.startsWith("/operations/")) {
    return "command";
  }

  for (const layer of OPERATING_LAYERS) {
    for (const mod of layer.modules) {
      if (mod.comingSoon) continue;
      if (mod.href !== "/" && pathname.startsWith(mod.href)) {
        return layer.id;
      }
    }
  }

  return "execute";
}

export function resolveModuleByPath(pathname: string): LayerModule | null {
  if (
    pathname === "/" ||
    pathname === "/operations" ||
    pathname.startsWith("/workspaces")
  ) {
    return null;
  }

  for (const layer of OPERATING_LAYERS) {
    for (const mod of layer.modules) {
      if (mod.comingSoon) continue;
      if (mod.href !== "/" && pathname.startsWith(mod.href)) {
        return mod;
      }
    }
  }

  return null;
}

/** Visible product names for command bar / breadcrumbs */
export const LAYER_LABEL: Record<
  OperatingLayerId | "command" | "platform",
  string
> = {
  platform: "SentraCore",
  command: "Operations",
  understand: "Intelligence",
  organise: "Organisation",
  act: "Work",
  execute: "Operations",
  learn: "Insights",
};
