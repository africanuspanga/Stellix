import type React from "react";

/** Stellix mark — four-point star, monochrome (brand: black & white). */
export const LogoIcon = (props: React.ComponentProps<"svg">) => (
	<svg fill="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg" {...props}>
		<path d="M12 0c.9 6.5 5.5 11.1 12 12-6.5.9-11.1 5.5-12 12-.9-6.5-5.5-11.1-12-12C6.5 11.1 11.1 6.5 12 0Z" />
	</svg>
);

/** Stellix wordmark with star mark. */
export const Logo = (props: React.ComponentProps<"svg">) => (
	<svg
		fill="currentColor"
		viewBox="0 0 114 24"
		xmlns="http://www.w3.org/2000/svg"
		{...props}
	>
		<path d="M12 0c.9 6.5 5.5 11.1 12 12-6.5.9-11.1 5.5-12 12-.9-6.5-5.5-11.1-12-12C6.5 11.1 11.1 6.5 12 0Z" />
		<text
			x="30"
			y="18"
			fontFamily="inherit"
			fontSize="18"
			fontWeight="700"
			letterSpacing="-0.5"
		>
			Stellix
		</text>
	</svg>
);
