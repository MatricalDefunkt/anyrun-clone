#!/bin/bash

# Start the self-destruct timer in the background
/self_destruct.sh &

# Explicitly set the USER environment variable
export USER=sandbox

# Set GNOME as the desktop session
echo "[Xvnc]" > ~/.vnc/config
echo "session=gnome" >> ~/.vnc/config

# Start VNC server on display :1 with specific geometry and depth
vncserver :1 -geometry 1280x800 -depth 24 -rfbport 5901

# Start noVNC using websockify, listening on port 6080 and forwarding to VNC server on 5901
websockify --web /usr/share/novnc/ 6080 localhost:5901 &

# Keep the container running
sleep infinity
