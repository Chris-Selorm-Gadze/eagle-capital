import type { ReactNode } from "react";
import { SidebarInset, SidebarProvider } from "@/components/ui/sidebar";
import { TooltipProvider } from "@/components/ui/tooltip";
import { AppHeader } from "@/components/app-header";
import { AppSidebar } from "@/components/app-sidebar";
import { Toaster } from "@/components/ui/sonner";
import { AppNavProvider } from "@/components/app-nav-context";
import type { NavKey } from "@/shared/routing";

export function AppShell({
	active,
	navigate,
	onAddTrade,
	headerActions,
	children,
	contentRef,
}: {
	active: NavKey;
	navigate: (key: NavKey) => void;
	onAddTrade: () => void;
	headerActions?: ReactNode;
	children: ReactNode;
	/** The dashboard snapshots this element to an image. */
	contentRef?: React.Ref<HTMLDivElement>;
}) {
	return (
		<AppNavProvider value={{ active, navigate }}>
			{/* Sidebar menu buttons render tooltips when the rail is collapsed, and
			    Radix's Tooltip requires a provider above them. */}
			<TooltipProvider delayDuration={0}>
				<div className="overflow-hidden">
					<SidebarProvider className="relative h-svh">
						<AppSidebar onAddTrade={onAddTrade} />
						<SidebarInset className="md:peer-data-[variant=inset]:ml-0">
							<AppHeader actions={headerActions} />
							<div
								className="flex flex-1 flex-col gap-4 overflow-y-auto p-4 md:p-6"
								ref={contentRef}
							>
								{children}
							</div>
						</SidebarInset>
					</SidebarProvider>
				<Toaster position="bottom-right" richColors />
				</div>
			</TooltipProvider>
		</AppNavProvider>
	);
}
