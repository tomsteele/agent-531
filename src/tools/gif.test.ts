// gif.test.ts
import { describe, expect, it } from "bun:test";
import { getDailySuccess } from "./gif";

describe("getDailySuccess", () => {
	it("should return a gif url", async () => {
		const result = await getDailySuccess();
		console.log(result);
		expect(result).toContain("giphy.com");
	});
});
