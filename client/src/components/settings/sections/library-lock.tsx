import { useState } from "react";
import { toast } from "sonner";
import {
	SettingAction,
	SettingRow,
} from "@/components/settings/components/parts";
import { Button } from "@/components/ui/button";
import {
	Dialog,
	DialogClose,
	DialogContent,
	DialogDescription,
	DialogFooter,
	DialogHeader,
	DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@/components/ui/select";
import {
	useLibraryLockIsSet,
	useSetLibraryPassword,
} from "@/hooks/services/use-library";
import { useSystem, useUpdateSettings } from "@/hooks/services/use-settings";
import { LOCK_SESSION_LABELS } from "@/lib/library-lock";
import type { CategoryLockSession } from "@/types/bindings";

const IDLE_MINUTES = [1, 5, 15, 30, 60];

export function LibraryLockGroup() {
	const lockIsSet = useLibraryLockIsSet();
	const { category_lock_session, category_lock_idle_minutes } = useSystem();
	const updateSettings = useUpdateSettings();

	const [open, setOpen] = useState(false);
	const hasPassword = lockIsSet.data === true;

	return (
		<>
			<SettingAction
				actionLabel={hasPassword ? "Change password" : "Set password"}
				description={
					hasPassword
						? "Categories marked as locked ask for this before they open."
						: "Set one to make a category lockable, from its options in Manage categories."
				}
				label="Library password"
				onAction={() => setOpen(true)}
			/>

			<SettingRow
				description="How long a category stays open once you have unlocked it"
				label="Keep unlocked"
			>
				<Select
					items={LOCK_SESSION_LABELS}
					onValueChange={(value) =>
						updateSettings("system", {
							category_lock_session: value as CategoryLockSession,
						})
					}
					value={category_lock_session}
				>
					<SelectTrigger className="w-56">
						<SelectValue />
					</SelectTrigger>
					<SelectContent>
						{(Object.keys(LOCK_SESSION_LABELS) as CategoryLockSession[]).map(
							(value) => (
								<SelectItem key={value} value={value}>
									{LOCK_SESSION_LABELS[value]}
								</SelectItem>
							),
						)}
					</SelectContent>
				</Select>
			</SettingRow>

			{category_lock_session === "IdleTimeout" && (
				<SettingRow
					description="Locked categories close again after this much inactivity"
					label="Inactivity timeout"
				>
					<Select
						items={Object.fromEntries(
							IDLE_MINUTES.map((m) => [String(m), minuteLabel(m)]),
						)}
						onValueChange={(value) =>
							updateSettings("system", {
								category_lock_idle_minutes: Number(value),
							})
						}
						value={String(category_lock_idle_minutes)}
					>
						<SelectTrigger className="w-56">
							<SelectValue />
						</SelectTrigger>
						<SelectContent>
							{IDLE_MINUTES.map((minutes) => (
								<SelectItem key={minutes} value={String(minutes)}>
									{minuteLabel(minutes)}
								</SelectItem>
							))}
						</SelectContent>
					</Select>
				</SettingRow>
			)}

			<PasswordDialog
				hasPassword={hasPassword}
				onOpenChange={setOpen}
				open={open}
			/>
		</>
	);
}

const minuteLabel = (minutes: number) =>
	minutes === 1 ? "1 minute" : `${minutes} minutes`;

function PasswordDialog({
	open,
	onOpenChange,
	hasPassword,
}: {
	open: boolean;
	onOpenChange: (open: boolean) => void;
	hasPassword: boolean;
}) {
	const save = useSetLibraryPassword();

	const [current, setCurrent] = useState("");
	const [next, setNext] = useState("");
	const [confirm, setConfirm] = useState("");

	const mismatch = confirm.length > 0 && next !== confirm;
	const canSave =
		next.length > 0 && next === confirm && (!hasPassword || current.length > 0);

	const close = () => {
		setCurrent("");
		setNext("");
		setConfirm("");
		onOpenChange(false);
	};

	const submit = () => {
		save.mutate(
			{ current: hasPassword ? current : null, password: next },
			{
				onSuccess: () => {
					toast.success(hasPassword ? "Password changed" : "Password set");
					close();
				},
				onError: (e) => toast.error(e.message),
			},
		);
	};

	return (
		<Dialog
			onOpenChange={(value) => (value ? onOpenChange(true) : close())}
			open={open}
		>
			<DialogContent>
				<DialogHeader>
					<DialogTitle>
						{hasPassword ? "Change library password" : "Set library password"}
					</DialogTitle>
					<DialogDescription>
						This gates locked categories inside the app. It is not encryption —
						the entries stay readable in the database, in backups, and in sync
						snapshots. If you forget it, Settings → Developer can reset the
						lock, which unlocks every locked category.
					</DialogDescription>
				</DialogHeader>

				<form
					className="flex flex-col gap-3"
					onSubmit={(e) => {
						e.preventDefault();
						if (canSave) submit();
					}}
				>
					{hasPassword && (
						<div className="flex flex-col gap-1.5">
							<Label>Current password</Label>
							<Input
								autoFocus
								onChange={(e) => setCurrent(e.target.value)}
								type="password"
								value={current}
							/>
						</div>
					)}

					<div className="flex flex-col gap-1.5">
						<Label>New password</Label>
						<Input
							autoFocus={!hasPassword}
							onChange={(e) => setNext(e.target.value)}
							type="password"
							value={next}
						/>
					</div>

					<div className="flex flex-col gap-1.5">
						<Label>Confirm password</Label>
						<Input
							aria-invalid={mismatch}
							onChange={(e) => setConfirm(e.target.value)}
							type="password"
							value={confirm}
						/>
						{mismatch && (
							<p className="text-destructive text-xs">
								The passwords do not match.
							</p>
						)}
					</div>

					<DialogFooter>
						<DialogClose
							render={
								<Button type="button" variant="ghost">
									Cancel
								</Button>
							}
						/>
						<Button disabled={!canSave || save.isPending} type="submit">
							{save.isPending ? "Saving…" : "Save"}
						</Button>
					</DialogFooter>
				</form>
			</DialogContent>
		</Dialog>
	);
}
