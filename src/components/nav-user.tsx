"use client";

import { useEffect, useState } from "react";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogFooter,
	DialogHeader,
	DialogTitle,
} from "@/components/ui/dialog";
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuGroup,
	DropdownMenuItem,
	DropdownMenuLabel,
	DropdownMenuSeparator,
	DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
	SidebarMenuButton,
	SidebarMenuItem,
	useSidebar,
} from "@/components/ui/sidebar";
import { useAuth } from "@/features/auth/AuthContext";
import { ensureProfile, updateUsername, type Profile } from "@/db/profiles";
import { errorMessage } from "@/utils/errors";
import { ChevronsUpDownIcon, LogOutIcon, UserIcon } from "lucide-react";

function initials(name: string): string {
	return name.slice(0, 2).toUpperCase();
}

export function NavUser() {
	const { user, signOut } = useAuth();
	const { isMobile } = useSidebar();
	const [profile, setProfile] = useState<Profile | null>(null);
	const [accountOpen, setAccountOpen] = useState(false);
	const [usernameInput, setUsernameInput] = useState("");
	const [saving, setSaving] = useState(false);
	const [error, setError] = useState<string | null>(null);

	useEffect(() => {
		if (!user) {
			setProfile(null);
			return;
		}
		let cancelled = false;
		ensureProfile(user.id, user.email).then((p) => {
			if (cancelled) return;
			setProfile(p);
			setUsernameInput(p.username);
		});
		return () => {
			cancelled = true;
		};
	}, [user]);

	async function handleSaveUsername() {
		if (!user) return;
		setError(null);
		setSaving(true);
		try {
			const updated = await updateUsername(user.id, usernameInput);
			setProfile(updated);
			setUsernameInput(updated.username);
			setAccountOpen(false);
		} catch (err) {
			setError(errorMessage(err));
		} finally {
			setSaving(false);
		}
	}

	const displayName = profile?.username ?? user?.email ?? "?";

	return (
		<>
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
							<DropdownMenuItem onSelect={() => setAccountOpen(true)}>
								<UserIcon />
								Account
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

			<Dialog onOpenChange={setAccountOpen} open={accountOpen}>
				<DialogContent className="sm:max-w-100">
					<DialogHeader>
						<DialogTitle>Your account</DialogTitle>
						<DialogDescription>{user?.email}</DialogDescription>
					</DialogHeader>

					<div className="grid gap-2">
						<Label htmlFor="account-username">Username</Label>
						<Input
							id="account-username"
							onChange={(e) => setUsernameInput(e.target.value)}
							placeholder="Choose a username"
							value={usernameInput}
						/>
						{error && <p className="text-destructive text-sm">{error}</p>}
					</div>

					<DialogFooter>
						<Button onClick={() => setAccountOpen(false)} variant="outline">
							Cancel
						</Button>
						<Button
							disabled={
								saving ||
								!usernameInput.trim() ||
								usernameInput === profile?.username
							}
							onClick={handleSaveUsername}
						>
							{saving ? "Saving…" : "Save username"}
						</Button>
					</DialogFooter>
				</DialogContent>
			</Dialog>
		</>
	);
}
