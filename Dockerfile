# Use Ubuntu 22.04 as base
FROM ubuntu:22.04 AS base

# Avoid interactive prompts during installation
ENV DEBIAN_FRONTEND=noninteractive

# Install core utilities
RUN apt-get update && apt-get install -y --no-install-recommends \
  sudo \
  wget \
  net-tools \
  dbus-x11 \
  && rm -rf /var/lib/apt/lists/*

# Stage for desktop environment
FROM base AS desktop
# Install GNOME instead of XFCE
RUN apt-get update && apt-get install -y --no-install-recommends \
  ubuntu-desktop-minimal \
  gnome-session \
  gnome-terminal \
  gnome-shell \
  xauth \
  && rm -rf /var/lib/apt/lists/*

# Stage for VNC setup
FROM desktop AS vnc
# Install VNC related packages
RUN apt-get update && apt-get install -y --no-install-recommends \
  tightvncserver \
  novnc \
  websockify \
  && rm -rf /var/lib/apt/lists/*

# Final stage
FROM vnc AS final

# Create a non-root user 'sandbox'
RUN useradd -m -s /bin/bash sandbox && \
  echo "sandbox:password" | chpasswd && \
  adduser sandbox sudo

# Set up VNC directory and password for the sandbox user
RUN mkdir -p /home/sandbox/.vnc && \
  echo "password" | vncpasswd -f > /home/sandbox/.vnc/passwd

# Create an empty .Xauthority file
RUN touch /home/sandbox/.Xauthority

# Set ownership and permissions for VNC and Xauthority files
RUN chown -R sandbox:sandbox /home/sandbox/.vnc /home/sandbox/.Xauthority && \
  chmod 0600 /home/sandbox/.vnc/passwd && \
  chmod 0600 /home/sandbox/.Xauthority

# Copy startup and self-destruct scripts
COPY entrypoint.sh /entrypoint.sh
COPY self_destruct.sh /self_destruct.sh
RUN chmod +x /entrypoint.sh /self_destruct.sh

# Expose noVNC port
EXPOSE 6080

# Set user and working directory
USER sandbox
WORKDIR /home/sandbox

# Set the entrypoint script
ENTRYPOINT ["/entrypoint.sh"]
