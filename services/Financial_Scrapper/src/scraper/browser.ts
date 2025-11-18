import { chromium } from "playwright";

export async function getBrowser() {
  return chromium.launch({ headless: true });
}