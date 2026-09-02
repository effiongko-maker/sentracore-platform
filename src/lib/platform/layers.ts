import {
  AlertTriangle,
  Building2,
  ClipboardList,
  Database,
  FileBarChart2,
  FileCheck2,
  MessageSquarePlus,
  Package,
  ScanSearch,
  CircleDot,
  Users,
  Wrench,
  Banknote,
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
    label: "Understand",
    modules: [
      fm({
        label: "Finance",
        href: "/finance",
        icon: Banknote,
        title: "Finance",
        description:
          "Operational costs, reimbursement submissions, and payment position",
      }),
      fm({
        label: "Intelligence",
        href: "/intelligence",
        icon: ScanSearch,
        title: "Intelligence",
        description: "What the organisation is telling you",
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
        description: "Report a facility need",
      }),
      fm({
        label: "Issues",
        href: "/issues",
        icon: CircleDot,
        title: "Issues",
        description: "Manage what needs attention",
      }),
      fm({
        label: "Work",
        href: "/work",
        icon: Wrench,
        title: "Work",
        description: "What we are doing about Issues",
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
];

/** Routable legacy modules — excluded from command palette / primary layers. */
const LEGACY_LAYER_MODULES: LayerModule[] = [
  fm({
    label: "Legacy Maintenance",
    href: "/maintenance",
    icon: Wrench,
    title: "Legacy Maintenance",
    description: "Compatibility work surface (historical deep links)",
  }),
  fm({
    label: "Legacy Incidents",
    href: "/incidents",
    icon: AlertTriangle,
    title: "Legacy Incidents",
    description: "Historical incident records (compatibility access)",
  }),
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

  for (const mod of LEGACY_LAYER_MODULES) {
    if (mod.href !== "/" && pathname.startsWith(mod.href)) {
      return "act";
    }
  }

  return "act";
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

  for (const mod of LEGACY_LAYER_MODULES) {
    if (mod.href !== "/" && pathname.startsWith(mod.href)) {
      return mod;
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
  understand: "Understand",
  organise: "Organisation",
  act: "Work",
  execute: "Operations",
  learn: "Insights",
};

/**
 * Breadcrumb segments for GlobalCommandBar.
 * Understand-layer modules (Finance, Intelligence, Reports) are direct workspaces —
 * no "Understand" parent in the trail (matches OrganisationalCompass sidebar IA).
 */
export function resolveBreadcrumbSegments(pathname: string): string[] {
  const layer = resolveLayerByPath(pathname);
  const module = resolveModuleByPath(pathname);

  if (module) {
    if (layer === "understand") {
      return [module.label];
    }
    return [LAYER_LABEL[layer], module.label];
  }

  if (layer === "platform") {
    return ["Platform Home"];
  }

  return [LAYER_LABEL[layer]];
}
