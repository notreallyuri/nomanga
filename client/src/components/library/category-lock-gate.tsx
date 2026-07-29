import { LockKeyIcon } from "@phosphor-icons/react";
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useVerifyLibraryPassword } from "@/hooks/services/use-library";
import { libraryLock } from "@/lib/library-lock";
import type { Category } from "@/types/bindings";

/**
 * Stands in for the entry grid while a locked category is closed. The gate is
 * an access control inside the app, not encryption — the entries themselves are
 * stored in the clear.
 */
export function CategoryLockGate({ category }: { category: Category }) {
	const [password, setPassword] = useState("");
	const [wrong, setWrong] = useState(false);
	const verify = useVerifyLibraryPassword();

	// A different locked tab starts from a clean field.
	useEffect(() => {
		setPassword("");
		setWrong(false);
	}, []);

	const submit = () => {
		if (!password) return;

		verify.mutate(password, {
			onSuccess: (ok) => {
				if (ok) {
					libraryLock.unlock(category.id);
					setPassword("");
					return;
				}
				setWrong(true);
			},
		});
	};

	return (
		<div className="flex flex-col items-center gap-3 py-20 text-center">
			<LockKeyIcon className="text-muted-foreground" size={32} />

			<div>
				<p className="font-medium text-sm">{category.name} is locked</p>
				<p className="mt-0.5 text-muted-foreground text-xs">
					Enter your library password to open it.
				</p>
			</div>

			<form
				className="flex w-full max-w-64 flex-col gap-2"
				onSubmit={(e) => {
					e.preventDefault();
					submit();
				}}
			>
				<Input
					aria-invalid={wrong}
					aria-label="Library password"
					autoFocus
					onChange={(e) => {
						setPassword(e.target.value);
						setWrong(false);
					}}
					placeholder="Password"
					type="password"
					value={password}
				/>
				<Button disabled={!password || verify.isPending} type="submit">
					Unlock
				</Button>
			</form>

			{wrong && <p className="text-destructive text-xs">Wrong password.</p>}
		</div>
	);
}
