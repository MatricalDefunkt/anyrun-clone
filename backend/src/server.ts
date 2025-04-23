import dotenv from "dotenv";
import express from "express";
import cors from "cors";
import sqlite3 from "sqlite3";
import { open } from "sqlite";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import path from "path";
import { exec } from "child_process";
import util from "util";

// Create a promisified version of exec
const execAsync = util.promisify(exec);

// Extend the Express Request type to include user information
declare global {
  namespace Express {
    interface Request {
      user?: {
        id: number;
        username: string;
        [key: string]: any;
      };
    }
  }
}

dotenv.config();

const app = express();
const PORT = process.env.PORT || 5000;
const JWT_SECRET = process.env.JWT_SECRET || "your-secret-key"; // In production, use a secure secret from env

// Middleware
app.use(cors());
app.use(express.json());

// Set up SQLite database
const dbPromise = open({
  filename: path.join(__dirname, "database.sqlite"),
  driver: sqlite3.Database,
});

// Initialize database
async function initializeDatabase() {
  const db = await dbPromise;

  // Create users table
  await db.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      username TEXT UNIQUE NOT NULL,
      password TEXT NOT NULL,
      email TEXT UNIQUE NOT NULL,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )
  `);

  // Create VMs table
  await db.exec(`
    CREATE TABLE IF NOT EXISTS virtual_machines (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL,
      name TEXT NOT NULL,
      status TEXT DEFAULT 'stopped',
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (user_id) REFERENCES users (id)
    )
  `);

  console.log("Database initialized");
}

// Initialize the database on startup
initializeDatabase().catch((err) => {
  console.error("Database initialization failed:", err);
  process.exit(1);
});

// Authentication middleware
const authenticateToken = (
  req: express.Request,
  res: express.Response,
  next: express.NextFunction
): void => {
  const authHeader = req.headers["authorization"];
  const token = authHeader && authHeader.split(" ")[1];

  if (!token) {
    res.status(401).json({ message: "Access token is required" });
    return;
  }

  jwt.verify(token, JWT_SECRET, (err, decoded) => {
    if (err) {
      res.status(403).json({ message: "Invalid or expired token" });
      return;
    }

    // Add user info to request object
    req.user = decoded as { id: number; username: string };
    next();
  });
};

// Create a Docker container for a VM (initially stopped)
async function createDockerContainer(
  vmId: number,
  vmName: string
): Promise<{ port: number; containerId: string }> {
  try {
    // Generate a unique port for noVNC (start from 6080 and offset based on vmId)
    const novncPort = 6080 + vmId;

    // Build docker create command (not run) to create but not start the container
    const dockerCommand = `docker build -t anyrun-vm-image -f /home/matdef/projects/anyrun-clone/Dockerfile /home/matdef/projects/anyrun-clone && \
      docker create --name anyrun-vm-${vmId} \
      -p ${novncPort}:6080 \
      anyrun-vm-image`;

    console.log(`Running Docker command: ${dockerCommand}`);
    const { stdout } = await execAsync(dockerCommand);
    const containerId = stdout.trim();

    console.log(
      `Container created with ID: ${containerId} on port ${novncPort} (stopped)`
    );
    return { port: novncPort, containerId };
  } catch (error) {
    console.error(`Error creating Docker container for VM ${vmId}:`, error);
    throw new Error(
      `Failed to create Docker container: ${(error as Error).message}`
    );
  }
}

// Start an existing Docker container
async function startDockerContainer(vmId: number): Promise<void> {
  try {
    const containerName = `anyrun-vm-${vmId}`;
    await execAsync(`docker start ${containerName}`);
    console.log(`Container ${containerName} started`);
  } catch (error) {
    console.error(`Error starting Docker container for VM ${vmId}:`, error);
    throw new Error(
      `Failed to start Docker container: ${(error as Error).message}`
    );
  }
}

// Stop and remove a Docker container
async function removeDockerContainer(vmId: number): Promise<void> {
  try {
    const containerName = `anyrun-vm-${vmId}`;
    // First stop the container if it's running
    await execAsync(`docker stop ${containerName}`).catch(() => {
      // Ignore errors if container is not running
      console.log(`Container ${containerName} not running or already stopped`);
    });

    // Then remove the container
    await execAsync(`docker rm ${containerName}`).catch(() => {
      // Ignore errors if container doesn't exist
      console.log(
        `Container ${containerName} doesn't exist or already removed`
      );
    });

    console.log(`Container ${containerName} stopped and removed`);
  } catch (error) {
    console.error(`Error removing Docker container for VM ${vmId}:`, error);
    throw new Error(
      `Failed to remove Docker container: ${(error as Error).message}`
    );
  }
}

// Auth routes
app.post("/api/register", async (req, res) => {
  try {
    const { username, password, email } = req.body;

    if (!username || !password || !email) {
      res
        .status(400)
        .json({ message: "Username, password, and email are required" });
      return;
    }

    const db = await dbPromise;

    // Check if user already exists
    const existingUser = await db.get(
      "SELECT id FROM users WHERE username = ? OR email = ?",
      [username, email]
    );
    if (existingUser) {
      res.status(409).json({ message: "Username or email already exists" });
      return;
    }

    // Hash the password
    const hashedPassword = await bcrypt.hash(password, 10);

    // Create the user
    const result = await db.run(
      "INSERT INTO users (username, password, email) VALUES (?, ?, ?)",
      [username, hashedPassword, email]
    );

    res
      .status(201)
      .json({ message: "User registered successfully", userId: result.lastID });
  } catch (error) {
    console.error("Registration error:", error);
    res.status(500).json({ message: "Server error during registration" });
  }
});

app.post("/api/login", async (req, res) => {
  try {
    const { username, password } = req.body;

    if (!username || !password) {
      res.status(400).json({ message: "Username and password are required" });
      return;
    }

    const db = await dbPromise;

    // Find the user
    const user = await db.get(
      "SELECT id, username, password FROM users WHERE username = ?",
      [username]
    );
    if (!user) {
      res.status(401).json({ message: "Invalid username or password" });
      return;
    }

    // Verify password
    const isValidPassword = await bcrypt.compare(password, user.password);
    if (!isValidPassword) {
      res.status(401).json({ message: "Invalid username or password" });
      return;
    }

    // Generate JWT token
    const token = jwt.sign(
      { id: user.id, username: user.username },
      JWT_SECRET,
      { expiresIn: "1h" }
    );

    res.json({
      message: "Login successful",
      user: { id: user.id, username: user.username },
      token,
    });
  } catch (error) {
    console.error("Login error:", error);
    res.status(500).json({ message: "Server error during login" });
  }
});

// VM Management routes
app.get("/api/vms", authenticateToken, async (req, res) => {
  try {
    const userId = req.user?.id;
    const db = await dbPromise;

    const vms = await db.all(
      "SELECT * FROM virtual_machines WHERE user_id = ?",
      [userId]
    );

    res.json({ vms });
  } catch (error) {
    console.error("Error fetching VMs:", error);
    res.status(500).json({ message: "Server error while fetching VMs" });
  }
});

app.post("/api/vms", authenticateToken, async (req, res) => {
  try {
    const userId = req.user?.id;
    const { name } = req.body;

    if (!name) {
      res.status(400).json({ message: "VM name is required" });
      return;
    }

    const db = await dbPromise;

    // Check if user already has 3 VMs
    const vmCount = await db.get(
      "SELECT COUNT(*) as count FROM virtual_machines WHERE user_id = ?",
      [userId]
    );

    if (vmCount.count >= 3) {
      res.status(400).json({ message: "Maximum limit of 3 VMs reached" });
      return;
    }

    // Create a new VM
    const result = await db.run(
      "INSERT INTO virtual_machines (user_id, name) VALUES (?, ?)",
      [userId, name]
    );

    const newVm = await db.get("SELECT * FROM virtual_machines WHERE id = ?", [
      result.lastID,
    ]);

    // Create Docker container for the VM
    const { port, containerId } = await createDockerContainer(
      newVm.id,
      newVm.name
    );

    res.status(201).json({
      message: "VM created successfully",
      vm: { ...newVm, port, containerId },
    });
  } catch (error) {
    console.error("Error creating VM:", error);
    res.status(500).json({ message: "Server error while creating VM" });
  }
});

// Update VM status (start/stop)
app.put("/api/vms/:id/status", authenticateToken, async (req, res) => {
  try {
    const userId = req.user?.id;
    const vmId = parseInt(req.params.id);
    const { status } = req.body;

    if (!status || !["running", "stopped"].includes(status)) {
      res
        .status(400)
        .json({ message: "Valid status (running/stopped) is required" });
      return;
    }

    const db = await dbPromise;

    // Verify VM belongs to user
    const vm = await db.get(
      "SELECT * FROM virtual_machines WHERE id = ? AND user_id = ?",
      [vmId, userId]
    );

    if (!vm) {
      res.status(404).json({ message: "VM not found or unauthorized access" });
      return;
    }

    // Get current VM status
    const currentStatus = vm.status;

    // Only perform container operations if status is actually changing
    if (currentStatus !== status) {
      try {
        if (status === "running") {
          // Start VM: start Docker container
          await startDockerContainer(vmId);
          console.log(`Started VM ${vmId}`);
        } else {
          // Stop VM: remove Docker container
          await removeDockerContainer(vmId);
          console.log(`Stopped VM ${vmId}`);
        }
      } catch (containerError) {
        console.error(
          `Error managing container for VM ${vmId}:`,
          containerError
        );
        res.status(500).json({
          message: `Error ${
            status === "running" ? "starting" : "stopping"
          } VM container`,
        });
        return;
      }
    }

    // Update VM status in database
    await db.run("UPDATE virtual_machines SET status = ? WHERE id = ?", [
      status,
      vmId,
    ]);

    const updatedVm = await db.get(
      "SELECT * FROM virtual_machines WHERE id = ?",
      [vmId]
    );

    res.json({
      message: `VM ${
        status === "running" ? "started" : "stopped"
      } successfully`,
      vm: updatedVm,
    });
  } catch (error) {
    console.error("Error updating VM status:", error);
    res.status(500).json({ message: "Server error while updating VM" });
  }
});

// Delete VM
app.delete("/api/vms/:id", authenticateToken, async (req, res) => {
  try {
    const userId = req.user?.id;
    const vmId = req.params.id;

    if (!vmId) {
      res.status(400).json({ message: "VM ID is required" });
      return;
    }
    if (isNaN(Number(vmId))) {
      res.status(400).json({ message: "VM ID must be a number" });
      return;
    }

    const vmIdNumber = Number(vmId);

    const db = await dbPromise;

    // Verify VM belongs to user
    const vm = await db.get(
      "SELECT * FROM virtual_machines WHERE id = ? AND user_id = ?",
      [vmIdNumber, userId]
    );

    if (!vm) {
      res.status(404).json({ message: "VM not found or unauthorized access" });
      return;
    }

    // Delete the VM
    await db.run("DELETE FROM virtual_machines WHERE id = ?", [vmIdNumber]);

    // Remove Docker container for the VM
    await removeDockerContainer(vmIdNumber);

    res.json({ message: "VM deleted successfully" });
  } catch (error) {
    console.error("Error deleting VM:", error);
    res.status(500).json({ message: "Server error while deleting VM" });
  }
});

// Start the server
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});

export default app;
