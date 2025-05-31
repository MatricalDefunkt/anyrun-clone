FROM ubuntu:22.04 AS base

# Avoid interactive prompts during installation
ENV DEBIAN_FRONTEND=noninteractive

# Set locale properly to avoid perl warnings
ENV LANG=C.UTF-8
ENV LC_ALL=C.UTF-8

RUN apt update
# Install core utilities
RUN apt install -y --no-install-recommends sudo
RUN apt install -y --no-install-recommends wget
RUN apt install -y --no-install-recommends net-tools
RUN apt install -y --no-install-recommends dbus-x11
RUN apt install -y --no-install-recommends iputils-ping
RUN apt install -y --no-install-recommends netcat-traditional
RUN apt install -y --no-install-recommends procps
RUN apt install -y --no-install-recommends locales
RUN apt install -y --no-install-recommends curl
RUN apt install -y --no-install-recommends ca-certificates
RUN apt install -y --no-install-recommends firefox

# Generate locales
RUN locale-gen en_US.UTF-8
# Install a simpler desktop environment that works better with VNC
RUN apt install -y --no-install-recommends xorg
RUN apt install -y --no-install-recommends xfce4
RUN apt install -y --no-install-recommends xfce4-terminal
RUN apt install -y --no-install-recommends xauth
RUN apt install -y --no-install-recommends hicolor-icon-theme
RUN apt install -y --no-install-recommends adwaita-icon-theme
RUN apt install -y --no-install-recommends gnome-icon-theme
RUN apt install -y --no-install-recommends tango-icon-theme
# Install VNC related packages
RUN apt install -y --no-install-recommends tightvncserver
RUN apt install -y --no-install-recommends novnc
RUN apt install -y --no-install-recommends websockify
RUN apt install -y --no-install-recommends systemd
RUN apt install -y --no-install-recommends snapd

# Copy systemd service file
COPY sandbox-app.service /etc/systemd/system/sandbox-app.service
RUN systemctl enable sandbox-app.service

RUN rm -rf /var/lib/apt/lists/*

# Set root password (ensure you change "rootpassword" to a strong password or use a build argument)
RUN echo "root:password" | chpasswd

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

# Configure for systemd
ENV container=docker
STOPSIGNAL SIGRTMIN+3
ENTRYPOINT [ "/usr/sbin/init" ]
# CMD [] # This will allow systemd to start its default target
