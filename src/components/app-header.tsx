"use client";

import type { ReactNode } from "react";
import { Separator } from "@/components/ui/separator";
import { AppBreadcrumbs } from "@/components/app-breadcrumbs";
import { CustomSidebarTrigger } from "@/components/custom-sidebar-trigger";
import { navGroupLabelFor, navItemFor } from "@/components/app-shared";
import { useAppNav } from "@/components/app-nav-context";
import { HeaderUserMenu } from "@/components/nav-user";
import { AppSearch } from "@/components/app-search";
import { ThemeSwitcher } from "@/components/theme-switcher";

/** `actions` is the per-page slot on the right — the dashboard puts its
 * account filter and buttons there; most pages pass nothing.
 *
 * `onAddTrade` is here only because the command palette offers it: the palette
 * lists every destination plus the one action the sidebar promotes, so the two
 * can't drift apart. */
export function AppHeader({
	actions,
	onAddTrade,
}: {
	actions?: ReactNode;
	onAddTrade: () => void;
}) {
	const { active } = useAppNav();
	const item = navItemFor(active);
	const groupLabel = navGroupLabelFor(active);

	return (
		<header className="sticky top-0 z-50 flex h-14 shrink-0 items-center justify-between gap-2 border-b bg-background px-4 md:px-6">
			<div className="flex min-w-0 items-center gap-3">
				<CustomSidebarTrigger />
				<Separator
					className="mr-1 h-4 data-[orientation=vertical]:self-center"
					orientation="vertical"
				/>
				<AppBreadcrumbs
					page={item ? { title: item.title, icon: item.icon } : null}
					section={groupLabel}
				/>
			</div>
			<div className="flex items-center gap-2">
				<AppSearch onAddTrade={onAddTrade} />
				{actions}
				<ThemeSwitcher />
				<HeaderUserMenu />
			</div>
		</header>
	);
}
