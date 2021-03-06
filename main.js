const {app, BrowserWindow} = require('electron');
const path = require('path');
const url = require('url');

let win;

function createWindow () {
  win = new BrowserWindow({width: 1050, height: 690,icon:"dis.png"});

  
  win.loadURL(url.format({
    pathname: path.join(__dirname, './views/index-min.html'),
    protocol: 'file:',
    slashes: true
  }));
  win.webContents.openDevTools()
  win.on('closed', () => {
    win = null
  });
}

app.on('ready', createWindow);

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

app.on('activate', () => {
  if (win === null) {
    createWindow();
  }
})