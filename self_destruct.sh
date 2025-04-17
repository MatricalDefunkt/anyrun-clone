#!/bin/bash

echo "Container will self-destruct in 10 minutes."
sleep 600 # 10 minutes * 60 seconds/minute

echo "Time's up! Stopping container."
# A simple way to stop the container is to kill the entrypoint process (PID 1)
kill 1
