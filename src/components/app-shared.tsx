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

export type SidebarNavItem = {
	title: string;
	key: NavKey;
	icon?: ReactNode;
};

export type SidebarNavGroup = {
	label?: string;
	items: SidebarNavItem[];
};

export const navGroups: SidebarNavGroup[] = [
	{
		items: [
			{ title: "Dashboard", key: "dashboard", icon: <LayoutGridIcon /> },
			{ title: "Live Positions", key: "livepositions", icon: <ZapIcon /> },
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
			{ title: "Broker Connections", key: "brokers", icon: <PlugIcon /> },
			{ title: "Trade Copier", key: "tradecopier", icon: <CopyIcon /> },
		],
	},
	{
		label: "You",
		items: [{ title: "Settings", key: "settings", icon: <SettingsIcon /> }],
	},
];

/** Flat lookup, used by the header breadcrumb to name the current page. */
export const navLinks: SidebarNavItem[] = navGroups.flatMap((g) => g.items);

export function navItemFor(key: NavKey): SidebarNavItem | undefined {
	return navLinks.find((i) => i.key === key);
}

export function navGroupLabelFor(key: NavKey): string | undefined {
	return navGroups.find((g) => g.items.some((i) => i.key === key))?.label;
}
