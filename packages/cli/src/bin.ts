#!/usr/bin/env node
// Standalone CLI entry point for the published npm package.
//
// The build script bundles this file to dist/bin.js (see the "bin" field in
// package.json), so `bunx agent-plugins-doctor` (or `npx`) runs under plain
// Node without needing Bun's TypeScript resolution. The in-repo
// bin/agent-plugins-doctor file is the Bun-based developer entry point and is
// not published.
import { main } from './index.js';

main();
