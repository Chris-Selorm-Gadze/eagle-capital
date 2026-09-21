"use client";

import type { ReactNode } from "react";
import { cn } from "cn";
import { Button } from "@/components/ui/button";
import {
	Empty,
	EmptyContent,
	EmptyDescription,
	EmptyHeader,
	EmptyMedia,
	EmptyTitle,
} from "@/components/ui/empty";
import { Skeleton } from "@/components/ui/skeleton";
import { AlertCircleIcon, InfoIcon, TriangleAlertIcon } from "lucide-react";

/* The vocabulary every page shares.
 *
 * Before this, seventeen routes said the same three things seventeen ways: the
 * dashboard got a real skeleton and every other page got the word "Loading…";
 * errors were a toast in four files and an inline coloured <div> everywhere
 * else, including one written as a raw inline style; and `ui/empty.tsx` had been
 * installed during the shadcn work and imported by nobody, while each page
 * hand-rolled its own version of it.
 *
 * Four components, used by all of them. */

/** Page title, one line of orientation, and an optional action slot.
 *
 * Replaces the `.page-title` / `.page-header` pair in theme.css and the bare
 * `<h1>`+`<p>` each page opened with. */
export function PageHeader({
	title,
	description,
	actions,
	className,
}: {
	title: ReactNode;
	/** One sentence on what this page is for. Omit rather than pad. */
	description?: ReactNode;
	actions?: ReactNode;
	className?: string;
}) {
	return (
		<div
			className={cn(
				"flex flex-wrap items-start justify-between gap-x-4 gap-y-2",
				className,
			)}
		>
			<div className="min-w-0 space-y-1">
				<h1 className="font-heading font-semibold text-xl tracking-tight">
					{title}
				</h1>
				{description && (
					// Held near 75 characters: a description that runs the full width of a
					// desktop content column is one the eye skips.
					<p className="max-w-[75ch] text-muted-foreground text-sm">
						{description}
					</p>
				)}
			</div>
			{actions && <div className="flex shrink-0 items-center gap-2">{actions}</div>}
		</div>
	);
}

/** Nothing to show yet, and the way out of it.
 *
 * `action` is deliberately a single primary route rather than a row of choices —
 * an empty state offering three buttons is a page that hasn't decided what the
 * user should do next. */
export function EmptyState({
	icon,
	title,
	description,
	action,
	className,
}: {
	icon?: ReactNode;
	title: ReactNode;
	description?: ReactNode;
	action?: { label: string; onClick: () => void };
	className?: string;
}) {
	return (
		<Empty className={className}>
			<EmptyHeader>
				{icon && <EmptyMedia variant="icon">{icon}</EmptyMedia>}
				<EmptyTitle>{title}</EmptyTitle>
				{description && <EmptyDescription>{description}</EmptyDescription>}
			</EmptyHeader>
			{action && (
				<EmptyContent>
					<Button onClick={action.onClick} size="sm">
						{action.label}
					</Button>
				</EmptyContent>
			)}
		</Empty>
	);
}

/** Something failed, said the same way everywhere.
 *
 * `role="alert"` so a failure that appears after the page has settled is
 * announced rather than sitting silently on screen. The retry is offered only
 * when the caller actually has something to retry — a button that does nothing
 * is worse than no button. */
export function ErrorNotice({
	message,
	onRetry,
	className,
}: {
	message: ReactNode;
	onRetry?: () => void;
	className?: string;
}) {
	return (
		<div
			className={cn(
				"flex flex-wrap items-start gap-2.5 rounded-lg border border-destructive/30 bg-destructive/8 px-3.5 py-3 text-sm",
				className,
			)}
			role="alert"
		>
			<AlertCircleIcon className="mt-px size-4 shrink-0 text-destructive" />
			<div className="min-w-0 flex-1 text-foreground/90">{message}</div>
			{onRetry && (
				<Button onClick={onRetry} size="xs" variant="outline">
					Try again
				</Button>
			)}
		</div>
	);
}

/** Something the user should know that isn't a failure — a caveat, a
 * consequence, a state worth explaining. The copier and broker pages are full of
 * these ("these accounts share one MT5 install, so their copies queue"), and
 * they were each a differently-coloured strip.
 *
 * Not `role="alert"`: these are present when the page renders rather than
 * arriving in response to an action, and an alert interrupts. */
export function Notice({
	tone = "warning",
	children,
	action,
	className,
}: {
	tone?: "warning" | "info";
	children: ReactNode;
	action?: ReactNode;
	className?: string;
}) {
	const Icon = tone === "warning" ? TriangleAlertIcon : InfoIcon;
	return (
		<div
			className={cn(
				"flex flex-wrap items-start gap-2.5 rounded-lg border px-3.5 py-3 text-sm",
				tone === "warning"
					? "border-(--warning)/30 bg-(--warning)/8"
					: "border-border bg-muted/50",
				className,
			)}
		>
			<Icon
				className={cn(
					"mt-px size-4 shrink-0",
					tone === "warning" ? "text-(--warning)" : "text-muted-foreground",
				)}
			/>
			<div className="min-w-0 flex-1 text-foreground/90">{children}</div>
			{action}
		</div>
	);
}

/** A loading placeholder shaped like the thing that's coming.
 *
 * `rows` matches the list or table about to replace it, so the page doesn't
 * resize under the reader the moment it arrives. */
export function LoadingRows({
	rows = 4,
	className,
}: {
	rows?: number;
	className?: string;
}) {
	return (
		<div
			aria-live="polite"
			aria-busy="true"
			className={cn("space-y-2", className)}
			// The label carries the meaning; the bars are decoration and would
			// otherwise be announced as a run of empty elements.
			role="status"
		>
			<span className="sr-only">Loading…</span>
			{Array.from({ length: rows }, (_, i) => (
				<Skeleton className="h-11 w-full" key={i} />
			))}
		</div>
	);
}
