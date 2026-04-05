import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

test("index.html exists for GitHub Pages and points visitors to Labelcreator.html", async () => {
  const html = await readFile(new URL("../index.html", import.meta.url), "utf8");

  assert.match(html, /<title>Labelcreator<\/title>/);
  assert.match(html, /http-equiv="refresh" content="0; url=\.\/Labelcreator\.html"/i);
  assert.match(html, /href="\.\/Labelcreator\.html"/i);
});
