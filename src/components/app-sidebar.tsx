import { Logo, LogoIcon } from "@/components/logo";
import {
	Sidebar,
	SidebarContent,
	SidebarFooter,
	SidebarGroup,
	SidebarHeader,
	SidebarMenu,
	SidebarMenuButton,
	SidebarMenuItem,
	useSidebar,
} from "@/components/ui/sidebar";
import { NavGroup } from "@/components/nav-group";
import { visibleNavGroups } from "@/components/app-shared";
import { brokerSyncConfigured } from "@/lib/brokerSyncClient";
import { NavUser } from "@/components/nav-user";
import { useAppNav } from "@/components/app-nav-context";
import { PlusIcon } from "lucide-react";

export function AppSidebar({ onAddTrade }: { onAddTrade: () => void }) {
	const { navigate } = useAppNav();
	const { state } = useSidebar();
	const collapsed = state === "collapsed";
	// Broker Connections and Live Positions are served by a parked backend.
	// Hidden rather than disabled: a nav entry is a promise the page works.
	const groups = visibleNavGroups({ brokerSync: brokerSyncConfigured });

	return (
		<Sidebar collapsible="icon" variant="inset">
			<SidebarHeader className="h-14 justify-center">
				<SidebarMenuButton
					className="hover:bg-transparent active:bg-transparent"
					onClick={() => navigate("dashboard")}
				>
					{collapsed ? <LogoIcon /> : <Logo />}
					<span className="sr-only">EagleCapital — dashboard</span>
				</SidebarMenuButton>
			</SidebarHeader>

			<SidebarContent>
				<SidebarGroup>
					<SidebarMenuItem className="flex items-center gap-2">
						<SidebarMenuButton
							className="min-w-8 bg-primary text-primary-foreground duration-200 ease-(--ease-out) hover:bg-primary/90 hover:text-primary-foreground active:bg-primary/90 active:text-primary-foreground"
							onClick={onAddTrade}
							tooltip="Log a trade"
						>
							<PlusIcon />
							<span>Log a trade</span>
						</SidebarMenuButton>
					</SidebarMenuItem>
				</SidebarGroup>

				{groups.map((group, index) => (
					<NavGroup key={group.label ?? `group-${index}`} {...group} />
				))}
			</SidebarContent>

			<SidebarFooter>
				<SidebarMenu>
					<NavUser />
				</SidebarMenu>
			</SidebarFooter>
		</Sidebar>
	);
}
