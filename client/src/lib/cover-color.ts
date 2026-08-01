const cache = new Map<string, Promise<string | null>>();

const SAMPLE = 48;
const BUCKET_BITS = 4;

function dominant(data: Uint8ClampedArray): string | null {
	const buckets = new Map<
		number,
		{ r: number; g: number; b: number; n: number }
	>();
	let fallback: { r: number; g: number; b: number; n: number } | null = null;

	for (let i = 0; i < data.length; i += 4) {
		const r = data[i] as number;
		const g = data[i + 1] as number;
		const b = data[i + 2] as number;
		const a = data[i + 3] as number;

		if (a < 200) continue;

		const max = Math.max(r, g, b);
		const min = Math.min(r, g, b);
		const lightness = (max + min) / 2 / 255;
		const chroma = max - min;

		if (!fallback) fallback = { r: 0, g: 0, b: 0, n: 0 };
		fallback.r += r;
		fallback.g += g;
		fallback.b += b;
		fallback.n += 1;

		if (lightness < 0.15 || lightness > 0.9 || chroma < 24) continue;

		const key =
			((r >> BUCKET_BITS) << 16) |
			((g >> BUCKET_BITS) << 8) |
			(b >> BUCKET_BITS);

		const bucket = buckets.get(key) ?? { r: 0, g: 0, b: 0, n: 0 };
		bucket.r += r;
		bucket.g += g;
		bucket.b += b;
		bucket.n += 1;
		buckets.set(key, bucket);
	}

	let best: { r: number; g: number; b: number; n: number } | null = null;
	for (const bucket of buckets.values()) {
		if (!best || bucket.n > best.n) best = bucket;
	}

	const winner = best ?? fallback;
	if (!winner || winner.n === 0) return null;

	const r = Math.round(winner.r / winner.n);
	const g = Math.round(winner.g / winner.n);
	const b = Math.round(winner.b / winner.n);

	return `rgb(${r} ${g} ${b})`;
}

export function coverColor(url: string): Promise<string | null> {
	const hit = cache.get(url);
	if (hit) return hit;

	const pending = new Promise<string | null>((resolve) => {
		const image = new Image();

		image.crossOrigin = "anonymous";

		image.onload = () => {
			try {
				const canvas = document.createElement("canvas");
				canvas.width = SAMPLE;
				canvas.height = SAMPLE;

				const context = canvas.getContext("2d", { willReadFrequently: true });
				if (!context) return resolve(null);

				context.drawImage(image, 0, 0, SAMPLE, SAMPLE);
				resolve(dominant(context.getImageData(0, 0, SAMPLE, SAMPLE).data));
			} catch (error) {
				console.warn("cover colour extraction failed", error);
				resolve(null);
			}
		};

		image.onerror = () => resolve(null);
		image.src = url;
	});

	cache.set(url, pending);
	return pending;
}
