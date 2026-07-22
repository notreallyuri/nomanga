import type { Settings } from "@/types/bindings";
import {
	type FieldsOfType,
	type SelectProps,
	SettingGroup,
	SettingSelect,
	SettingSwitch,
	type SwitchProps,
} from "./parts";

export function createGroupComponents<K extends keyof Settings>(group: K) {
	return {
		Group: SettingGroup,
		Switch: (props: SwitchProps<K>) => (
			<SettingSwitch group={group} {...props} />
		),
		Select: <F extends FieldsOfType<NonNullable<Settings[K]>, string>>(
			props: SelectProps<K, F>,
		) => <SettingSelect group={group} {...props} />,
	};
}
