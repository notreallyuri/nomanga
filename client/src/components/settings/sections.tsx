import type { ComponentType } from "react";
import type { SettingsRoute } from "./nav";
import { AppearanceSection } from "./sections/appearance";
import { ExtensionSection } from "./sections/extensions";
import { ReaderSection } from "./sections/reader";
import { SourceSection } from "./sections/sources";
import { SystemSection } from "./sections/system";

function LibrarySection() {
	return <></>;
}

export const SECTIONS: Record<SettingsRoute, ComponentType> = {
	Appearance: AppearanceSection,
	Reader: ReaderSection,
	Library: LibrarySection,
	Sources: SourceSection,
	Extensions: ExtensionSection,
	System: SystemSection,
};
