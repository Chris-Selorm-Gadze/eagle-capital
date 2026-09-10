import { Button } from "@/components/ui/button";
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuGroup,
	DropdownMenuItem,
	DropdownMenuSeparator,
	DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import type { Account } from "@/db/schema";
import { deleteAccount } from "@/db/accounts";
import { errorMessage } from "@/utils/errors";
import {
	BuildingIcon,
	CameraIcon,
	ChevronDownIcon,
	PlusIcon,
	Trash2Icon,
} from "lucide-react";

/* The dashboard's header slot: which account you're looking at, plus the three
 * actions that used to live in the old TopBar. */

export function DashboardActions({
	accounts,
	accountFilter,
	onAccountFilterChange,
	onAddTrade,
	onAddAccount,
	onSnapshot,
	onAccountDeleted,
}: {
	accounts: Account[];
	accountFilter: string | "all";
	onAccountFilterChange: (value: string | "all") => void;
	onAddTrade: () => void;
	onAddAccount: () => void;
	onSnapshot?: () => void;
	onAccountDeleted: () => void;
}) {
	async function handleDeleteAccount(a: Account, e: React.MouseEvent) {
		e.preventDefault();
		e.stopPropagation();
		if (
			!window.confirm(
				`Delete ${a.label}? This also deletes all sessions, trades, payouts, and rewards logged against it. This cannot be undone.`
			)
		) {
			return;
		}
		try {
			await deleteAccount(a.id!);
			if (accountFilter === a.id) onAccountFilterChange("all");
			onAccountDeleted();
		} catch (err) {
			alert(errorMessage(err));
		}
	}

	const selectedLabel =
		accountFilter === "all"
			? "All accounts"
			: (accounts.find((a) => a.id === accountFilter)?.label ?? "All accounts");

	return (
		<>
			<DropdownMenu>
				<DropdownMenuTrigger asChild>
					<Button className="max-w-48" size="sm" variant="outline">
						<BuildingIcon />
						<span className="truncate">{selectedLabel}</span>
						<ChevronDownIcon />
					</Button>
				</DropdownMenuTrigger>
				<DropdownMenuContent align="end" className="w-56">
					<DropdownMenuGroup>
						<DropdownMenuItem onSelect={() => onAccountFilterChange("all")}>
							All accounts
						</DropdownMenuItem>
					</DropdownMenuGroup>
					{accounts.length > 0 && <DropdownMenuSeparator />}
					<DropdownMenuGroup>
						{accounts.map((a) => (
							<DropdownMenuItem
								className="group/account justify-between gap-2"
								key={a.id}
								onSelect={() => onAccountFilterChange(a.id!)}
							>
								<span className="truncate">{a.label}</span>
								<button
									aria-label={`Delete ${a.label}`}
									className="text-muted-foreground opacity-0 transition-opacity group-hover/account:opacity-100 hover:text-destructive"
									onClick={(e) => handleDeleteAccount(a, e)}
									type="button"
								>
									<Trash2Icon className="size-3.5" />
								</button>
							</DropdownMenuItem>
						))}
					</DropdownMenuGroup>
				</DropdownMenuContent>
			</DropdownMenu>

			{onSnapshot && (
				<Button onClick={onSnapshot} size="icon-sm" variant="outline" aria-label="Snapshot dashboard">
					<CameraIcon />
				</Button>
			)}
			<Button onClick={onAddAccount} size="sm" variant="outline">
				<PlusIcon />
				<span className="hidden sm:inline">Account</span>
			</Button>
			<Button onClick={onAddTrade} size="sm">
				<PlusIcon />
				<span className="hidden sm:inline">Trade</span>
			</Button>
		</>
	);
}
