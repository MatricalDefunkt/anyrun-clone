#!/bin/bash

echo "Container will self-destruct in 10 minutes."
sleep 600 # 10 minutes * 60 seconds/minute

echo "Time's up! Stopping container."
# Use a more reliable way to shut down the container
# First try to gracefully stop processes
pkill -TERM -u sandbox
sleep 5
# Then forcefully terminate if needed
kill 1
