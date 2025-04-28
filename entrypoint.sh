#!/bin/bash

# Start the self-destruct timer in the background
/self_destruct.sh &

# Wait for network to be ready
sleep 2

# Explicitly set environment variables
export USER=sandbox
export HOME=/home/sandbox
export DISPLAY=:1
export LANG=C.UTF-8
export LC_ALL=C.UTF-8

# Start dbus daemon
mkdir -p /tmp/.X11-unix
if [ ! -e /var/run/dbus/pid ]; then
    sudo mkdir -p /var/run/dbus
    dbus-daemon --system --fork
fi
dbus-launch --sh-syntax > /tmp/dbus.env || true
if [ -f /tmp/dbus.env ]; then
    source /tmp/dbus.env
    echo "D-Bus session started with address: $DBUS_SESSION_BUS_ADDRESS"
fi

# Ensure icon cache is updated
mkdir -p ~/.icons ~/.themes
update-icon-caches ~/.icons || true
xfconf-query -c xsettings -p /Net/IconThemeName -s "Adwaita" || true

# Create proper xstartup file for Xfce4
mkdir -p ~/.vnc
cat > ~/.vnc/xstartup << EOF
#!/bin/bash
xrdb $HOME/.Xresources
# Fix font path issue
xset fp default

# Initialize icon theme
export XDG_DATA_DIRS=/usr/share
xfce4-session &
EOF

chmod +x ~/.vnc/xstartup

# Test and fix network connectivity
echo "Testing network connectivity..."
if ! ping -c 1 8.8.8.8; then
    # Try alternative DNS resolution methods for read-only filesystem
    echo "Network connectivity issue detected"
    # Use resolvconf if available
    if command -v resolvconf >/dev/null 2>&1; then
        echo "nameserver 8.8.8.8" | sudo resolvconf -a eth0
    else
        # Manual DNS configuration
        echo "Warning: Cannot update DNS configuration dynamically"
        # Try to manually update resolv.conf if possible
        if [ -w /etc/resolv.conf ]; then
            echo "nameserver 8.8.8.8" | sudo tee /etc/resolv.conf
        else
            echo "Warning: Cannot update DNS configuration on read-only filesystem"
            # Try to configure DNS via environment variable
            export RES_OPTIONS="nameserver 8.8.8.8"
        fi
    fi
fi

# Set VNC password
echo "password" | vncpasswd -f > $HOME/.vnc/passwd
chmod 600 $HOME/.vnc/passwd

# Kill any existing VNC sessions
vncserver -kill :1 2>/dev/null || true
rm -rf /tmp/.X1-lock /tmp/.X11-unix/X1 2>/dev/null || true

# Start VNC server with proper configuration
vncserver :1 -geometry 1280x800 -depth 24 -rfbport 5901

# Print debug information
echo "VNC server started with the following configuration:"
echo "DISPLAY=$DISPLAY"
echo "VNC Password file: $(ls -la ~/.vnc/passwd)"
echo "VNC Log file: $(ls -la ~/.vnc/*log)"
echo "Active VNC processes:"
ps aux | grep vnc
echo "Active X processes:"
ps aux | grep X
echo "Active Xfce processes:"
ps aux | grep xfce
echo "Network configuration:"
netstat -tuln
echo "DNS configuration:"
cat /etc/resolv.conf

# Start noVNC using websockify
websockify --web /usr/share/novnc/ 0.0.0.0:6080 localhost:5901 &
echo "noVNC started on port 6080, forwarding to VNC on port 5901"

# Keep the container running and show logs for debugging
tail -f ~/.vnc/*log
