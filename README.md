# Maya Link

> **Disclaimer:** Maya Link is an independent, MIT-licensed open-source project. It is not affiliated with, endorsed by, sponsored by, or supported by Autodesk or Microsoft, and it is not part of Maya or Visual Studio Code.

Connect to Autodesk Maya from VS Code over `maya.cmds.commandPort`. See your open instances in the sidebar, connect/disconnect and send Python from the editor.

## Setup

1. In VS Code run **Maya Link: Copy Setup Script**
2. Paste it into Maya's Script Editor (Python tab) and run it
3. Click the Maya link icon in the Activity Bar

The panel scans ports 7000–7100 automatically, so it fills in on its own.

## Commands

| Command | What it does |
|---|---|
| `Maya link: Refresh` | Rescan for Maya instances |
| `Maya link: Send Python to Maya` | Send the editor selection, or the whole file if nothing is selected |
| `Maya link: Copy Setup Script` | Copy the Python setup snippet to the clipboard |
| `Maya link: Show Setup Script` | Open the snippet as a Python document |

Only one instance is connected at a time. The choice is stored per workspace.

## Roadmap

- Open a terminal/console with the maya output

## Developing

Project layout, build steps and internal notes [DEVELOPING.md](DEVELOPING.md).