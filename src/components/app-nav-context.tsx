import { createContext, useContext } from "react";
import type { NavKey } from "@/shared/routing";

/* The shell's nav state. A context rather than prop drilling because NavGroup
 * sits two levels below the shell and only needs these two values. */

interface AppNavValue {
	active: NavKey;
	navigate: (key: NavKey) => void;
}

const AppNavContext = createContext<AppNavValue | null>(null);

export const AppNavProvider = AppNavContext.Provider;

export function useAppNav(): AppNavValue {
	const ctx = useContext(AppNavContext);
	if (!ctx) throw new Error("useAppNav must be used inside AppShell");
	return ctx;
}
