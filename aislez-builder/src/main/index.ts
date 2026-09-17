import { app, shell, BrowserWindow, Menu, dialog, ipcMain } from 'electron'
import { join } from 'path'
import { readFile, writeFile } from 'fs/promises'

let mainWindow: BrowserWindow | null = null

/** Sanitizes a project name into a safe filename component — strips characters invalid on Windows/macOS/Linux. */
function sanitizeFileName(name: string): string {
  return name.replace(/[/\\?%*:|"<>]/g, '-').trim() || 'project'
}

function registerFileHandlers(): void {
  ipcMain.handle('project:save', async (_event, json: string, projectName: string, existingPath: string | null) => {
    try {
      let filePath = existingPath
      if (!filePath) {
        const result = await dialog.showSaveDialog(mainWindow!, {
          title: 'Save Aislez Project',
          defaultPath: `${sanitizeFileName(projectName)}.ifp`,
          filters: [{ name: 'Aislez Project', extensions: ['ifp'] }]
        })
        if (result.canceled || !result.filePath) return { canceled: true }
        filePath = result.filePath
      }
      await writeFile(filePath, json, 'utf-8')
      return { canceled: false, filePath }
    } catch (err) {
      return { canceled: false, error: (err as Error).message }
    }
  })

  ipcMain.handle('project:open', async () => {
    try {
      const result = await dialog.showOpenDialog(mainWindow!, {
        title: 'Open Aislez Project',
        filters: [{ name: 'Aislez Project', extensions: ['ifp'] }],
        properties: ['openFile']
      })
      if (result.canceled || result.filePaths.length === 0) return { canceled: true }
      const filePath = result.filePaths[0]
      const data = await readFile(filePath, 'utf-8')
      return { canceled: false, filePath, data }
    } catch (err) {
      return { canceled: false, error: (err as Error).message }
    }
  })
}

function buildMenu(): void {
  const send = (action: string): void => {
    mainWindow?.webContents.send('menu:action', action)
  }

  const menu = Menu.buildFromTemplate([
    {
      label: 'File',
      submenu: [
        {
          label: 'Save',
          accelerator: 'CmdOrCtrl+S',
          registerAccelerator: false,
          click: () => send('save')
        },
        {
          label: 'Open',
          accelerator: 'CmdOrCtrl+O',
          registerAccelerator: false,
          click: () => send('open')
        },
        { type: 'separator' },
        { role: 'quit', label: 'Exit' }
      ]
    },
    {
      label: 'Edit',
      submenu: [
        {
          label: 'Undo',
          accelerator: 'CmdOrCtrl+Z',
          registerAccelerator: false,
          click: () => send('undo')
        },
        {
          label: 'Redo',
          accelerator: 'CmdOrCtrl+Y',
          registerAccelerator: false,
          click: () => send('redo')
        },
        { type: 'separator' },
        { role: 'cut' },
        { role: 'copy' },
        { role: 'paste' },
        { type: 'separator' },
        {
          label: 'Delete Selected',
          accelerator: 'Delete',
          registerAccelerator: false,
          click: () => send('delete')
        },
        { type: 'separator' },
        { role: 'selectAll' }
      ]
    },
    {
      label: 'View',
      submenu: [
        { role: 'togglefullscreen' }
      ]
    },
    {
      label: 'Window',
      submenu: [
        { role: 'minimize' }
      ]
    },
    {
      label: 'Help',
      submenu: [
        { label: 'About Aislez Builder', enabled: false }
      ]
    }
  ])

  Menu.setApplicationMenu(menu)
}

function createWindow(): void {
  mainWindow = new BrowserWindow({
    width: 1400,
    height: 900,
    minWidth: 900,
    minHeight: 600,
    show: false,
    title: 'Aislez Builder',
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      sandbox: false
    }
  })

  mainWindow.on('ready-to-show', () => {
    mainWindow!.show()
  })

  mainWindow.webContents.setWindowOpenHandler((details) => {
    shell.openExternal(details.url)
    return { action: 'deny' }
  })

  const isDev = !!process.env['ELECTRON_RENDERER_URL']

  // ESC exits fullscreen without consuming the key event for the renderer.
  // Ctrl/Cmd+R reloads the renderer — dev-only, so a retailer can never
  // accidentally wipe an in-progress project by reloading mid-session.
  mainWindow.webContents.on('before-input-event', (_event, input) => {
    if (input.type === 'keyDown' && input.key === 'Escape' && mainWindow?.isFullScreen()) {
      mainWindow.setFullScreen(false)
    }
    if (isDev && input.type === 'keyDown' && input.key.toLowerCase() === 'r' && (input.control || input.meta)) {
      mainWindow?.reload()
    }
  })

  if (isDev) {
    mainWindow.loadURL(process.env['ELECTRON_RENDERER_URL']!)
  } else {
    mainWindow.loadFile(join(__dirname, '../renderer/index.html'))
  }
}

app.whenReady().then(() => {
  if (process.platform === 'win32') {
    app.setAppUserModelId('com.aislez.builder')
  }

  buildMenu()
  registerFileHandlers()
  createWindow()

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit()
  }
})
