"use client";

import { useTheme } from "next-themes";
import { MoonIcon, SunIcon } from "lucide-react";
import { Button } from "@/components/ui/button";

/** Light/dark toggle. Both icons render and CSS picks the visible one, so the
 *  server and first client render always match (no hydration mismatch). */
export function ThemeToggle() {
	const { resolvedTheme, setTheme } = useTheme();

	return (
		<Button
			aria-label="Toggle dark mode"
			onClick={() => setTheme(resolvedTheme === "dark" ? "light" : "dark")}
			size="icon-sm"
			variant="outline"
		>
			<SunIcon className="dark:hidden" />
			<MoonIcon className="hidden dark:block" />
		</Button>
	);
}
