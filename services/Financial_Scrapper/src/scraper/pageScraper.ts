import { getBrowser } from "./browser";

export async function scrapePage(url: string) {
  const browser = await getBrowser();
  const page = await browser.newPage();
  await page.goto(url);

  const data = await page.evaluate(() => ({
    title: document.title,
    // TODO : lister les données à scraper.
  }));

  await browser.close();
  return data;
}
