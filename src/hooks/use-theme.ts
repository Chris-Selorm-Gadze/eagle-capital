"use client";

import { useEffect, useState } from "react";
import { readChoice, resolveTheme, subscribeTheme, type ResolvedTheme } from "@/lib/theme";

/** The theme actually on screen — "dark" or "light", never "system".
 *
 * For the handful of places that can't be styled by CSS custom properties and
 * have to be told which theme they're in: a third-party widget configured
 * through JavaScript, a canvas, an embedded iframe.
 *
 * Re-renders when the user picks a theme AND when the OS setting moves under a
 * "system" choice, because `subscribeTheme` covers both.
 */
export function useResolvedTheme(): ResolvedTheme {
	const [theme, setTheme] = useState<ResolvedTheme>(() => resolveTheme(readChoice()));
	useEffect(() => subscribeTheme(() => setTheme(resolveTheme(readChoice()))), []);
	return theme;
}
