import type { ComponentType } from "react";
import type { SettingsRoute } from "./nav";
import { AppearanceSection } from "./sections/appearance";
import { ReaderSection } from "./sections/reader";
import { SystemSection } from "./sections/system";

function LibrarySection() {
	return <></>;
}

function SourceSection() {
	return <></>;
}

function ExtensionSection() {
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
