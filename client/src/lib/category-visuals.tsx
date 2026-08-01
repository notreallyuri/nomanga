import {
	AlienIcon,
	BookmarkSimpleIcon,
	BookOpenIcon,
	CrownIcon,
	EyeIcon,
	FireIcon,
	FlaskIcon,
	GhostIcon,
	HeartIcon,
	type Icon,
	LightningIcon,
	MaskHappyIcon,
	PawPrintIcon,
	SkullIcon,
	SparkleIcon,
	StarIcon,
	SwordIcon,
} from "@phosphor-icons/react";

export const CATEGORY_COLORS = [
	"#ef4444", // red
	"#f97316", // orange
	"#eab308", // amber
	"#22c55e", // green
	"#14b8a6", // teal
	"#3b82f6", // blue
	"#8b5cf6", // violet
	"#ec4899", // pink
] as const;

export const CATEGORY_ICONS: Record<string, Icon> = {
	book: BookOpenIcon,
	bookmark: BookmarkSimpleIcon,
	heart: HeartIcon,
	star: StarIcon,
	fire: FireIcon,
	sparkle: SparkleIcon,
	lightning: LightningIcon,
	crown: CrownIcon,
	eye: EyeIcon,
	ghost: GhostIcon,
	skull: SkullIcon,
	sword: SwordIcon,
	alien: AlienIcon,
	mask: MaskHappyIcon,
	paw: PawPrintIcon,
	flask: FlaskIcon,
};

export const CATEGORY_ICON_KEYS = Object.keys(CATEGORY_ICONS);

export function categoryIcon(key: string | null | undefined): Icon | null {
	if (!key) return null;
	return CATEGORY_ICONS[key] ?? null;
}
