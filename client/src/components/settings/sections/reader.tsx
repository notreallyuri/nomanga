import { createGroupComponents } from "@/components/settings/components";

const { Group, Select, Switch } = createGroupComponents("reader");

export function ReaderSection() {
	return (
		<>
			<Group title="Display">
				<Select
					field="page_layout"
					label="Page Layout"
					options={[
						{ label: "Single Page", value: "SinglePage" },
						{ label: "Double Page", value: "DoublePage" },
						{ label: "Vertical Scroll", value: "VerticalScroll" },
					]}
				/>
				<Select
					field="reading_direction"
					label="Reading Direction"
					options={[
						{ label: "Left to Right", value: "LeftToRight" },
						{ label: "Right to Left", value: "RightToLeft" },
					]}
				/>
			</Group>

			<Group title="Zoom">
				<Select
					field="zoom_behavior"
					label="Zoom Behavior"
					options={[
						{ label: "Fit Width", value: "FitWidth" },
						{ label: "Fit Height", value: "FitHeight" },
						{ label: "Actual Size", value: "ActualSize" },
						{ label: "Manual", value: "Manual" },
					]}
				/>
				<Switch
					description="Keep the same zoom level when switching chapters"
					field="remember_zoom"
					label="Remember zoom"
				/>
			</Group>
		</>
	);
}
