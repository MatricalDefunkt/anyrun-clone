#!/bin/bash

# Start the self-destruct timer in the background
/self_destruct.sh &

# Explicitly set the USER environment variable
export USER=sandbox

# Start VNC server on display :1 with specific geometry and depth
# Removed invalid '-localhost no' option
vncserver :1 -geometry 1280x800 -depth 24 -rfbport 5901

# Start noVNC using websockify, listening on port 6080 and forwarding to VNC server on 5901
websockify --web /usr/share/novnc/ 6080 localhost:5901 &

# Keep the container running - tailing the VNC log is a simple way
# Wait a moment for the log file to be created
sleep infinity
