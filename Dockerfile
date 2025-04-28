FROM ubuntu:24.10 AS base

# Avoid interactive prompts during installation
ENV DEBIAN_FRONTEND=noninteractive

# Set locale properly to avoid perl warnings
ENV LANG=C.UTF-8
ENV LC_ALL=C.UTF-8

# Install core utilities
RUN apt update && apt install -y --no-install-recommends \
  sudo \
  wget \
  net-tools \
  dbus-x11 \
  iputils-ping \
  netcat-traditional \
  procps \
  locales \
  curl \
  ca-certificates \
  firefox \
  && rm -rf /var/lib/apt/lists/*

# Generate locales
RUN locale-gen en_US.UTF-8
# Install a simpler desktop environment that works better with VNC
RUN apt update && apt install -y --no-install-recommends \
  xorg \
  xfce4 \
  xfce4-terminal \
  xauth \
  hicolor-icon-theme \
  adwaita-icon-theme \
  gnome-icon-theme \
  tango-icon-theme \
  && rm -rf /var/lib/apt/lists/*
# Install VNC related packages
RUN apt update && apt install -y --no-install-recommends \
  tightvncserver \
  novnc \
  websockify \
  && rm -rf /var/lib/apt/lists/*

# Install latest Firefox (removed systemd-dependent approach)
RUN apt update && apt install -y --no-install-recommends \
  firefox \
  && rm -rf /var/lib/apt/lists/*

# Create a non-root user 'sandbox'
RUN useradd -m -s /bin/bash sandbox && \
  echo "sandbox:password" | chpasswd && \
  adduser sandbox sudo

# Set up VNC directory for the sandbox user
RUN mkdir -p /home/sandbox/.vnc

# Create an empty .Xauthority file
RUN touch /home/sandbox/.Xauthority

# Set ownership and permissions for VNC and Xauthority files
RUN chown -R sandbox:sandbox /home/sandbox/.vnc /home/sandbox/.Xauthority && \
  chmod 0600 /home/sandbox/.Xauthority

# Copy startup and self-destruct scripts
COPY entrypoint.sh /entrypoint.sh
COPY self_destruct.sh /self_destruct.sh
RUN chmod +x /entrypoint.sh /self_destruct.sh

# Expose VNC and noVNC ports
EXPOSE 5901 6080

# Set user and working directory
USER sandbox
WORKDIR /home/sandbox

# Set the entrypoint script
ENTRYPOINT ["/entrypoint.sh"]
