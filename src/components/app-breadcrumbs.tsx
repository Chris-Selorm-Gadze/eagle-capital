import type { ReactNode } from "react";
import {
	Breadcrumb,
	BreadcrumbItem,
	BreadcrumbList,
	BreadcrumbPage,
	BreadcrumbSeparator,
} from "@/components/ui/breadcrumb";

/** Current page shown in the header, optionally under its nav group. */
export type AppBreadcrumbPage = {
	title: string;
	icon?: ReactNode;
};

export function AppBreadcrumbs({
	page,
	section,
}: {
	page?: AppBreadcrumbPage | null;
	section?: string;
}) {
	if (!page?.title) {
		return null;
	}

	return (
		<Breadcrumb>
			<BreadcrumbList>
				{section && (
					<>
						<BreadcrumbItem className="hidden md:block text-muted-foreground">
							{section}
						</BreadcrumbItem>
						<BreadcrumbSeparator className="hidden md:block" />
					</>
				)}
				<BreadcrumbItem>
					<BreadcrumbPage className="flex items-center gap-2 [&>svg]:size-3.5">
						{page.icon}
						{page.title}
					</BreadcrumbPage>
				</BreadcrumbItem>
			</BreadcrumbList>
		</Breadcrumb>
	);
}
