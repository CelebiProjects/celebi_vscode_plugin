/**
 * Build package.json from partials in scripts/package/.
 *
 * Usage: node scripts/build-package.js
 *
 * Reads:
 *   scripts/package/base.json           — everything except contributes
 *   scripts/package/configuration.json  — contributes.configuration
 *   scripts/package/views.json          — contributes.viewsContainers, contributes.views
 *   scripts/package/commands.json       — contributes.commands
 *   scripts/package/menus.json          — contributes.menus (view/title, commandPalette, view/item/context)
 *
 * Writes the merged result to package.json at the project root.
 */
const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');
const pkgDir = path.join(__dirname, 'package');

// Read base
const base = JSON.parse(fs.readFileSync(path.join(pkgDir, 'base.json'), 'utf8'));

// Ensure contributes exists
if (!base.contributes) {
  base.contributes = {};
}

// Merge each contributes section
const sections = ['configuration', 'views', 'commands', 'menus'];
for (const section of sections) {
  const file = path.join(pkgDir, `${section}.json`);
  if (!fs.existsSync(file)) {
    console.warn(`Warning: ${section}.json not found, skipping`);
    continue;
  }
  const data = JSON.parse(fs.readFileSync(file, 'utf8'));
  // Deep merge: each section file has top-level keys that go under contributes
  for (const key of Object.keys(data)) {
    if (base.contributes[key]) {
      console.warn(`Warning: contributes.${key} already exists, overwriting`);
    }
    base.contributes[key] = data[key];
  }
}

// Write final package.json
const out = path.join(root, 'package.json');
fs.writeFileSync(out, JSON.stringify(base, null, '  ') + '\n');

// Count items for summary
const commands = base.contributes.commands?.length || 0;
const contextItems = base.contributes.menus?.['view/item/context']?.length || 0;
console.log(`package.json built: ${commands} commands, ${contextItems} context menu items`);
