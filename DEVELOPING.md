# Developing Maya Link

Internal notes: how the project is laid out, how to build it, and the Maya commandPort behaviours that are not obvious from the code. For installation and usage, see [README.md](README.md).

## Files

| File | What it does |
|---|---|
| `extension.ts` | Entry point; registers the commands |
| `types.ts` | The `MayaInstance` shape |
| `mayaService.ts` | State, refresh, connect/disconnect, scene and version queries |
| `portScanner.ts` | Finds open ports; change the range here |
| `mayaConnection.ts` | TCP client; host, timeout, anti-echo prefix |
| `parse.ts` | Cleans commandPort replies |
| `config.ts` | Per-workspace storage for the connected port |
| `output.ts` | "Maya Link" output channel for diagnostics |
| `setup.ts` | The setup-script commands |
| `setup/mayaSetup.py` | The snippet users paste into Maya |
| `panel/MayaPanel.ts` | Sidebar view, status bar, message routing |
| `webview/` | `index.html`, `styles.css`, `app.js` — the panel UI |
| `esbuild.js` | Build config and copied assets |
| `media/logo.svg` | The logo. Also the Activity Bar icon |
| `media/logo.png` | Generated from the SVG, used as the Marketplace icon |
| `package.json` | Commands, settings, views |

## Things that will bite you

**A payload that spans multiple lines, or contains an `import`, always answers `None`.** Maya switches to `exec()` semantics and has no value to hand back. So anything that reads a return value must be a single line with no import:

```python
cmds.file(query=True, sceneName=True)
cmds.about(product=True)
```

`cmds` is already in commandPort's namespace because the port is opened with `sourceType="python"`.

**`sendToMaya(port, code, antiEcho)` — the prefix is for prints.** The anti-echo prefix stops the Script Editor running your code twice, but it makes the payload multi-line, which is the problem above. Connect and ping need it. The scene and version queries must pass `false`.

**Maya terminates replies with a NUL byte** — `"myScene.ma\n\u0000"`. `cleanResponse()` in `parse.ts` strips quotes, newlines and NULs. Without it `"None\u0000"` fails an equality check and the scene name comes back as garbage.

**Never pool the socket.** `sendToMaya` opens one connection per call on purpose. Maya does not frame its replies — `print` output and command replies interleave, so on a long-lived socket leftovers bleed into the next request:

```
send 1 -> "None"
send 2 -> "ping 1"          ← output from send 1
send 3 -> "Noneping 2"      ← two replies concatenated
```

Closing right after the first chunk discards the leftovers. mayaCode pools a socket and gets away with it only because it never reads a return value.

**`sendCode` reports failures in Maya, not in VS Code.** The code is wrapped before sending:

```python
import maya.cmds as cmds
try:
    exec("<your code>")
except Exception:
    import traceback
    print(traceback.format_exc())
```

Maya prints the traceback to its Script Editor and swallows the exception, so commandPort sees a clean exit and VS Code stays quiet. `JSON.stringify` embeds the code safely as a Python string literal, and with no anti-echo prefix, traceback line numbers match your file.

**Runtime asset paths must use `dist/`, not `src/`.** `.vscodeignore` excludes `src/**`, so reading from `src/` works under F5 and breaks once installed.

**New static assets must be added to `COPY_FOLDERS` in `esbuild.js`** or they never reach `dist/`.

**`webview/app.js` runs in a browser.** No `require()`, `fs` or `path`.

## Building

```bash
npm install       # dev-only; nothing ships in node_modules
npm run compile   # type-check, lint, build
npm run watch     # same, rebuilding on change
```

Press `F5` to launch the Extension Development Host. Set `mayaLink.debug` to `true` in settings for verbose tracing, then check the **Maya link** output channel.

To package:

```bash
npm run package-vsix
code --install-extension maya-link-0.0.1.vsix
```

Install the `.vsix` rather than symlinking, so the packaged layout is exercised.
