import { GiphyFetch, type Rating } from "@giphy/js-fetch-api";

const gf = new GiphyFetch(process.env.GIPHY_API_KEY ?? "");
const GIPHY_RATING = (process.env.GIPHY_RATING ?? "pg") as Rating;

const SUCCESS_GIFS_SEARCH_TERMS = (process.env.GIPHY_SUCCESS_SEARCH ?? "woo").split(",");

export type GiphyType = "gifs" | "stickers" | "text" | "videos";

function randomElement<T>(arr: T[], fallback: T) {
	if (!arr || arr.length === 0) {
		return fallback;
	}
	const randomIndex = Math.floor(Math.random() * arr.length);
	return arr[randomIndex];
}

export async function getDailySuccess() {
	return await searchForGif(SUCCESS_GIFS_SEARCH_TERMS);
}

export async function getAnything(type: GiphyType, ...terms: string[]) {
	return await searchForGif(terms, type);
}

async function searchForGif(terms: string[], type: GiphyType = "gifs") {
	try {
		const search = randomElement(terms, "");
		console.log(`[giphy] searching "${search}" for type "${type}"`);
		const { data: gifs } = await gf.search(search, {
			sort: "relevant",
			lang: "es",
			limit: 4,
			rating: GIPHY_RATING,
			type: type,
		});
		const gif = randomElement(gifs, gifs[0]);
		const { origin, pathname } = new URL(gif.images.fixed_height.url);
		return origin + pathname;
	} catch (error) {
		console.error("Failed to fetch gif:", error);
		return "";
	}
}
