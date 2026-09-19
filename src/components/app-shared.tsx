import type { ReactNode } from "react";
import {
	LayoutGridIcon, ZapIcon, NotebookPenIcon, UserCogIcon, BookOpenIcon,
	BrainIcon, BriefcaseIcon, CandlestickChartIcon, CalendarDaysIcon,
	TableIcon, CopyIcon, PlugIcon, SettingsIcon,
} from "lucide-react";
import type { NavKey } from "@/shared/routing";

/* Navigation model for the app shell. Grouped along the same four layers the
 * marketing site uses — track, capture, review, execute — so the product and
 * the site describe themselves the same way.
 *
 * Items carry a NavKey rather than an href: the app routes through App.tsx's
 * history handling, not through anchor navigation. */

/** A backend some pages need that may not be running. Broker Connections is
 * served by the separate eaglecapital-broker-sync service, which is parked --
 * so the sidebar drops it rather than offering a door that opens onto a
 * notice. Setting the URL brings it back.
 *
 * Live Trading no longer carries this: it reads the worker's own snapshots out
 * of Postgres, so it works with the copier alone and needs nothing parked. */
export type NavRequirement = "brokerSync";

export type SidebarNavItem = {
	title: string;
	key: NavKey;
	icon?: ReactNode;
	/** Backend this page needs. Absent means it always works. */
	requires?: NavRequirement;
};

export type SidebarNavGroup = {
	label?: string;
	items: SidebarNavItem[];
};

export const navGroups: SidebarNavGroup[] = [
	{
		items: [
			{ title: "Dashboard", key: "dashboard", icon: <LayoutGridIcon /> },
			{ title: "Live Trading", key: "livepositions", icon: <ZapIcon /> },
		],
	},
	{
		label: "Trading",
		items: [
			{ title: "Trade Journal", key: "tradejournal", icon: <NotebookPenIcon /> },
			{ title: "Trade Log", key: "tradelog", icon: <TableIcon /> },
			{ title: "Charting", key: "charting", icon: <CandlestickChartIcon /> },
			{ title: "Economic Calendar", key: "calendar", icon: <CalendarDaysIcon /> },
		],
	},
	{
		label: "Review",
		items: [
			{ title: "AI Insights", key: "insights", icon: <BrainIcon /> },
			{ title: "Playbooks", key: "playbooks", icon: <BookOpenIcon /> },
			{ title: "Trader Management", key: "tradermanagement", icon: <UserCogIcon /> },
		],
	},
	{
		label: "Accounts",
		items: [
			{ title: "Prop Firm Manager", key: "cockpit", icon: <BriefcaseIcon /> },
			{ title: "Broker Connections", key: "brokers", icon: <PlugIcon />, requires: "brokerSync" },
			{ title: "Trade Copier", key: "tradecopier", icon: <CopyIcon /> },
		],
	},
	{
		label: "You",
		items: [{ title: "Settings", key: "settings", icon: <SettingsIcon /> }],
	},
];

/** The groups to render, given which optional backends are reachable.
 *
 * A group whose every item is unavailable is dropped entirely, so a parked
 * feature cannot leave a heading with nothing under it.
 *
 * Takes the flags rather than reading them, like `isUsableApiUrl(url, isProd)`
 * and `buildSetupNotice(..., isDev)` -- it keeps the filtering testable without
 * a build-time environment.
 */
export function visibleNavGroups(
	available: Record<NavRequirement, boolean>,
): SidebarNavGroup[] {
	return navGroups
		.map((g) => ({
			...g,
			items: g.items.filter((i) => !i.requires || available[i.requires]),
		}))
		.filter((g) => g.items.length > 0);
}

/** Flat lookup, used by the header breadcrumb to name the current page.
 *
 * Deliberately over the FULL list, not the visible one: a parked page reached
 * by URL or an old bookmark still routes, and its breadcrumb should name it
 * rather than fall back to "Dashboard". */
export const navLinks: SidebarNavItem[] = navGroups.flatMap((g) => g.items);

export function navItemFor(key: NavKey): SidebarNavItem | undefined {
	return navLinks.find((i) => i.key === key);
}

export function navGroupLabelFor(key: NavKey): string | undefined {
	return navGroups.find((g) => g.items.some((i) => i.key === key))?.label;
}
