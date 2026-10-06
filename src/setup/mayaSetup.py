# Maya Link — run once per Maya session
# Script Editor -> Python tab -> paste -> Run Script

import maya.cmds as cmds


def open_command_port(start=7001, end=7100):
    for port in range(start, end + 1):
        try:
            cmds.commandPort(name="127.0.0.1:%d" % port, sourceType="python")
            return port
        except Exception:
            continue  # occupied, try the next one
    raise RuntimeError("No free port found in %d-%d" % (start, end))


port = open_command_port()
print("Maya command port %d open" % port)

# To run this automatically every time Maya starts, save it as
# userSetup.py in your Maya scripts folder:
#   Linux/macOS: ~/maya/scripts/userSetup.py
#   Windows:     %USERPROFILE%\Documents\maya\scripts\userSetup.py