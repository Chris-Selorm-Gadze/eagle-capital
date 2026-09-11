"use client";

import { useEffect, useState } from "react";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuGroup,
	DropdownMenuItem,
	DropdownMenuLabel,
	DropdownMenuSeparator,
	DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
	SidebarMenuButton,
	SidebarMenuItem,
	useSidebar,
} from "@/components/ui/sidebar";
import { useAuth } from "@/features/auth/AuthContext";
import { ensureProfile, type Profile } from "@/db/profiles";
import { ChevronsUpDownIcon, LogOutIcon, UserIcon } from "lucide-react";
import { useAppNav } from "@/components/app-nav-context";

function initials(name: string): string {
	return name.slice(0, 2).toUpperCase();
}

/** The compact header variant. The sidebar is a closed drawer below `md`, so
 * the sidebar's user menu — and with it "Sign out" — isn't rendered at all on a
 * phone. This puts the same menu behind the avatar in the always-visible
 * header, and hides itself on desktop where the sidebar already has it. */
export function HeaderUserMenu() {
	const { user, signOut } = useAuth();
	const [profile, setProfile] = useState<Profile | null>(null);

	useEffect(() => {
		if (!user) return;
		let cancelled = false;
		ensureProfile(user.id, user.email)
			.then((p) => !cancelled && setProfile(p))
			.catch(() => {
				/* falls back to the email below */
			});
		return () => {
			cancelled = true;
		};
	}, [user]);

	const displayName = profile?.username ?? user?.email ?? "?";
	const { navigate } = useAppNav();

	return (
		<DropdownMenu>
			<DropdownMenuTrigger asChild>
				<Button
					aria-label="Account menu"
					className="md:hidden"
					size="icon-sm"
					variant="ghost"
				>
					<Avatar className="size-6 rounded-md">
						<AvatarFallback className="rounded-md text-[10px]">
							{initials(displayName)}
						</AvatarFallback>
					</Avatar>
				</Button>
			</DropdownMenuTrigger>
			<DropdownMenuContent align="end" className="w-56">
				<DropdownMenuLabel className="font-normal">
					<div className="grid text-sm leading-tight">
						<span className="truncate font-medium">{displayName}</span>
						<span className="truncate text-muted-foreground text-xs">
							{user?.email}
						</span>
					</div>
				</DropdownMenuLabel>
				<DropdownMenuSeparator />
				<DropdownMenuItem onSelect={() => navigate("settings")}>
					<UserIcon />
					Settings
				</DropdownMenuItem>
				<DropdownMenuSeparator />
				<DropdownMenuItem onSelect={() => void signOut()}>
					<LogOutIcon />
					Sign out
				</DropdownMenuItem>
			</DropdownMenuContent>
		</DropdownMenu>
	);
}

export function NavUser() {
	const { user, signOut } = useAuth();
	const { isMobile } = useSidebar();
	const { navigate } = useAppNav();
	const [profile, setProfile] = useState<Profile | null>(null);

	useEffect(() => {
		if (!user) {
			setProfile(null);
			return;
		}
		let cancelled = false;
		ensureProfile(user.id, user.email)
			.then((p) => !cancelled && setProfile(p))
			.catch(() => {
				/* falls back to the email below */
			});
		return () => {
			cancelled = true;
		};
	}, [user]);

	const displayName = profile?.username ?? user?.email ?? "?";

	return (
		<SidebarMenuItem>
			<DropdownMenu>
				<DropdownMenuTrigger asChild>
					<SidebarMenuButton
						className="data-[state=open]:bg-sidebar-accent"
						size="lg"
					>
						<Avatar className="size-8 rounded-md">
							<AvatarFallback className="rounded-md text-xs">
								{initials(displayName)}
							</AvatarFallback>
						</Avatar>
						<div className="grid flex-1 text-left text-sm leading-tight">
							<span className="truncate font-medium">{displayName}</span>
							<span className="truncate text-muted-foreground text-xs">
								{user?.email}
							</span>
						</div>
						<ChevronsUpDownIcon className="ml-auto" />
					</SidebarMenuButton>
				</DropdownMenuTrigger>
				<DropdownMenuContent
					align="end"
					className="w-60"
					side={isMobile ? "bottom" : "right"}
					sideOffset={4}
				>
					<DropdownMenuLabel className="font-normal">
						<div className="grid text-sm leading-tight">
							<span className="truncate font-medium">{displayName}</span>
							<span className="truncate text-muted-foreground text-xs">
								{user?.email}
							</span>
						</div>
					</DropdownMenuLabel>
					<DropdownMenuSeparator />
					<DropdownMenuGroup>
						{/* Was a dialog that only edited the username. Settings does that
						    plus export and deletion, so there's one account surface. */}
						<DropdownMenuItem onSelect={() => navigate("settings")}>
							<UserIcon />
							Settings
						</DropdownMenuItem>
					</DropdownMenuGroup>
					<DropdownMenuSeparator />
					<DropdownMenuItem onSelect={() => void signOut()}>
						<LogOutIcon />
						Sign out
					</DropdownMenuItem>
				</DropdownMenuContent>
			</DropdownMenu>
		</SidebarMenuItem>
	);
}
