/**
 * The theme setting used when none is configured: the monochrome pair, picked by terminal appearance.
 * Auto pairs already follow the terminal, so the default behaves like an explicit "mono-light/mono-dark".
 *
 * Kept apart from `theme.ts` so modules that only need the name do not load the theme machinery.
 */
export const DEFAULT_THEME_SETTING = "mono-light/mono-dark";
