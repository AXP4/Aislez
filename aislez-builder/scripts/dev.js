// Clears ELECTRON_RUN_AS_NODE before starting the dev server.
// Claude Code sets this env var (it's an Electron app itself), which breaks
// Electron's built-in module patching. Deleting it restores normal behavior.
const path = require('path')
const { spawn } = require('child_process')

const env = { ...process.env }
delete env.ELECTRON_RUN_AS_NODE

// Spawn electron-vite's Node.js entry point directly — avoids shell/cmd issues on Windows
const evBin = path.resolve(__dirname, '../node_modules/electron-vite/bin/electron-vite.js')
const child = spawn(process.execPath, [evBin, 'dev'], { env, stdio: 'inherit' })

child.on('exit', (code) => process.exit(code ?? 0))
