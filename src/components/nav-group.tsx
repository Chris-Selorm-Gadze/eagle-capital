import {
	SidebarGroup,
	SidebarGroupLabel,
	SidebarMenu,
	SidebarMenuButton,
	SidebarMenuItem,
} from "@/components/ui/sidebar";
import type { SidebarNavGroup } from "@/components/app-shared";
import { useAppNav } from "@/components/app-nav-context";

/* Flat menu — the collapsible sub-item tier the block shipped with is unused,
 * since none of this app's twelve pages nest. */
export function NavGroup({ label, items }: SidebarNavGroup) {
	const { active, navigate } = useAppNav();

	return (
		<SidebarGroup>
			{label && <SidebarGroupLabel>{label}</SidebarGroupLabel>}
			<SidebarMenu>
				{items.map((item) => (
					<SidebarMenuItem key={item.key}>
						<SidebarMenuButton
							isActive={active === item.key}
							onClick={() => navigate(item.key)}
							tooltip={item.title}
						>
							{item.icon}
							<span>{item.title}</span>
						</SidebarMenuButton>
					</SidebarMenuItem>
				))}
			</SidebarMenu>
		</SidebarGroup>
	);
}
