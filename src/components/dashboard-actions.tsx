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
	BriefcaseIcon,
	BuildingIcon,
	CameraIcon,
	ChevronDownIcon,
	PlusIcon,
	Trash2Icon,
} from "lucide-react";
import { toast } from "sonner";
import { useConfirm } from "@/shared/ui/confirm";

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
	const confirm = useConfirm();

	async function handleDeleteAccount(a: Account, e: React.MouseEvent) {
		e.preventDefault();
		e.stopPropagation();
		const ok = await confirm({
			title: `Delete ${a.label}?`,
			description:
				"This also deletes all sessions, trades, payouts and rewards logged against it. This cannot be undone.",
			confirmLabel: "Delete account",
			destructive: true,
		});
		if (!ok) return;
		try {
			await deleteAccount(a.id!);
			if (accountFilter === a.id) onAccountFilterChange("all");
			onAccountDeleted();
			toast.success(`${a.label} deleted`);
		} catch (err) {
			toast.error(errorMessage(err));
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
			{/* Both labels are hidden below sm, which used to leave two identical
			    "+" buttons side by side. The icons carry the meaning at that width,
			    and the aria-labels carry it for screen readers at every width. */}
			<Button aria-label="Add account" onClick={onAddAccount} size="sm" variant="outline">
				<BriefcaseIcon />
				<span className="hidden sm:inline">Account</span>
			</Button>
			<Button aria-label="Log a trade" onClick={onAddTrade} size="sm">
				<PlusIcon />
				<span className="hidden sm:inline">Trade</span>
			</Button>
		</>
	);
}
