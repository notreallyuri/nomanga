import type { ComponentType } from "react";
import type { SettingsRoute } from "./nav";
import { AppearanceSection } from "./sections/appearance";
import { DownloadsSection } from "./sections/downloads";
import { ExtensionSection } from "./sections/extensions";
import { ReaderSection } from "./sections/reader";
import { SourceSection } from "./sections/sources";
import { SystemSection } from "./sections/system";

export const SECTIONS: Record<SettingsRoute, ComponentType> = {
	Appearance: AppearanceSection,
	Reader: ReaderSection,
	Sources: SourceSection,
	Extensions: ExtensionSection,
	Downloads: DownloadsSection,
	System: SystemSection,
};
