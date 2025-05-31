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
import fs from "fs/promises";
import yaml from "js-yaml";

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
const JWT_SECRET = process.env.JWT_SECRET || "your-secret-key";

// Project paths
const PROJECT_ROOT = path.resolve(__dirname, "../..");
const DOCKERFILE_PATH = path.join(PROJECT_ROOT, "Dockerfile");
const COMPOSE_FILES_DIR = path.join(PROJECT_ROOT, "vm-compose-files");
const BASE_IMAGE_NAME = "ssem-sandbox-image";

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

  // Ensure COMPOSE_FILES_DIR exists
  try {
    await fs.mkdir(COMPOSE_FILES_DIR, { recursive: true });
    console.log(`Compose files directory ensured: ${COMPOSE_FILES_DIR}`);
  } catch (error) {
    console.error("Failed to create compose files directory:", error);
  }

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

    req.user = decoded as { id: number; username: string };
    next();
  });
};

// Utility function to run Docker Compose commands
async function runDockerComposeCommand(
  vmId: number,
  operation: string
): Promise<{ stdout: string; stderr: string }> {
  const composeFilePath = path.join(
    COMPOSE_FILES_DIR,
    `docker-compose.vm-${vmId}.yml`
  );
  const projectName = `vm_${vmId}`;
  const command = `docker-compose -f "${composeFilePath}" -p "${projectName}" ${operation}`;

  console.log(`Executing Docker Compose command for vm-${vmId}: ${command}`);
  try {
    const { stdout, stderr } = await execAsync(command);
    if (stderr && !stderr.toLowerCase().includes("warning")) {
      console.warn(`Docker Compose stderr for vm-${vmId} (${operation}): ${stderr}`);
    }
    return { stdout, stderr };
  } catch (error) {
    const execError = error as Error & { stdout?: string; stderr?: string };
    console.error(`Error executing Docker Compose for vm-${vmId} (${operation}): ${execError.message}`);
    console.error(`Stdout: ${execError.stdout}`);
    console.error(`Stderr: ${execError.stderr}`);
    throw new Error(`Failed to execute docker-compose ${operation} for VM ${vmId}: ${execError.message}`);
  }
}

// Create a Docker container for a VM (initially stopped)
async function createDockerContainer(
  vmId: number,
  vmName: string
): Promise<{ port: number; containerName: string }> {
  try {
    await fs.mkdir(COMPOSE_FILES_DIR, { recursive: true });

    const novncPort = 6080 + vmId;
    const vncPort = 5901 + vmId;
    const containerName = `ssem-vm-${vmId}`;

    const composeConfig = {
      version: "3.8",
      services: {
        sandbox_vm: {
          image: `${BASE_IMAGE_NAME}`,
          build: {
            context: PROJECT_ROOT,
            dockerfile: DOCKERFILE_PATH,
          },
          container_name: containerName,
          privileged: true,
          volumes: ["/sys/fs/cgroup:/sys/fs/cgroup:ro"],
          tmpfs: ["/run", "/run/lock"],
          ports: [`${vncPort}:5901`, `${novncPort}:6080`],
        },
      },
    };

    const composeFileContent = yaml.dump(composeConfig);
    const composeFilePath = path.join(
      COMPOSE_FILES_DIR,
      `docker-compose.vm-${vmId}.yml`
    );
    await fs.writeFile(composeFilePath, composeFileContent);
    console.log(`Generated docker-compose file for VM ${vmId} at ${composeFilePath}`);

    await runDockerComposeCommand(vmId, "up --build --no-start");

    console.log(
      `Container service for VM ${vmId} created with name: ${containerName} on noVNC port ${novncPort} (VNC ${vncPort}) (initially stopped)`
    );
    return { port: novncPort, containerName };
  } catch (error) {
    console.error(`Error creating Docker Compose service for VM ${vmId}:`, error);
    throw new Error(
      `Failed to create Docker Compose service: ${(error as Error).message}`
    );
  }
}

// Start an existing Docker container service
async function startDockerContainer(vmId: number): Promise<void> {
  try {
    await runDockerComposeCommand(vmId, "start sandbox_vm");
    console.log(`Container service for VM ${vmId} (sandbox_vm) started`);
  } catch (error) {
    console.error(`Error starting Docker Compose service for VM ${vmId}:`, error);
    throw new Error(
      `Failed to start Docker Compose service: ${(error as Error).message}`
    );
  }
}

// Stop a Docker container service without removing it
async function stopDockerContainer(vmId: number): Promise<void> {
  try {
    await runDockerComposeCommand(vmId, "stop sandbox_vm");
    console.log(`Container service for VM ${vmId} (sandbox_vm) stopped (preserved)`);
  } catch (error) {
    console.error(`Error stopping Docker Compose service for VM ${vmId}:`, error);
    throw new Error(
      `Failed to stop Docker Compose service: ${(error as Error).message}`
    );
  }
}

// Stop and remove a Docker container service and its configuration
async function removeDockerContainer(vmId: number): Promise<void> {
  try {
    await runDockerComposeCommand(vmId, "down --volumes");
    console.log(`Container service for VM ${vmId} (sandbox_vm) stopped and removed`);

    const composeFilePath = path.join(
      COMPOSE_FILES_DIR,
      `docker-compose.vm-${vmId}.yml`
    );
    try {
      await fs.unlink(composeFilePath);
      console.log(`Removed docker-compose file: ${composeFilePath}`);
    } catch (fileError) {
      console.warn(`Could not remove compose file ${composeFilePath}: ${(fileError as Error).message}`);
    }
  } catch (error) {
    console.error(`Error removing Docker Compose service for VM ${vmId}:`, error);
    throw new Error(
      `Failed to remove Docker Compose service: ${(error as Error).message}`
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

    const existingUser = await db.get(
      "SELECT id FROM users WHERE username = ? OR email = ?",
      [username, email]
    );
    if (existingUser) {
      res.status(409).json({ message: "Username or email already exists" });
      return;
    }

    const hashedPassword = await bcrypt.hash(password, 10);

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

    const user = await db.get(
      "SELECT id, username, password FROM users WHERE username = ?",
      [username]
    );
    if (!user) {
      res.status(401).json({ message: "Invalid username or password" });
      return;
    }

    const isValidPassword = await bcrypt.compare(password, user.password);
    if (!isValidPassword) {
      res.status(401).json({ message: "Invalid username or password" });
      return;
    }

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

    const vmCount = await db.get(
      "SELECT COUNT(*) as count FROM virtual_machines WHERE user_id = ?",
      [userId]
    );

    if (vmCount.count >= 3) {
      res.status(400).json({ message: "Maximum limit of 3 VMs reached" });
      return;
    }

    const result = await db.run(
      "INSERT INTO virtual_machines (user_id, name) VALUES (?, ?)",
      [userId, name]
    );

    const newVm = await db.get("SELECT * FROM virtual_machines WHERE id = ?", [
      result.lastID,
    ]);

    const { port, containerName } = await createDockerContainer(
      newVm.id,
      newVm.name
    );

    res.status(201).json({
      message: "VM created successfully",
      vm: { ...newVm, port, containerName },
    });
  } catch (error) {
    console.error("Error creating VM:", error);
    res.status(500).json({ message: "Server error while creating VM" });
  }
});

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

    const vm = await db.get(
      "SELECT * FROM virtual_machines WHERE id = ? AND user_id = ?",
      [vmId, userId]
    );

    if (!vm) {
      res.status(404).json({ message: "VM not found or unauthorized access" });
      return;
    }

    const currentStatus = vm.status;

    if (currentStatus !== status) {
      try {
        if (status === "running") {
          await startDockerContainer(vmId);
          console.log(`Started VM ${vmId}`);
        } else {
          await stopDockerContainer(vmId);
          console.log(`Stopped VM ${vmId} (container preserved for restart)`);
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

    const vm = await db.get(
      "SELECT * FROM virtual_machines WHERE id = ? AND user_id = ?",
      [vmIdNumber, userId]
    );

    if (!vm) {
      res.status(404).json({ message: "VM not found or unauthorized access" });
      return;
    }

    await db.run("DELETE FROM virtual_machines WHERE id = ?", [vmIdNumber]);

    await removeDockerContainer(vmIdNumber);

    res.json({ message: "VM deleted successfully" });
  } catch (error) {
    console.error("Error deleting VM:", error);
    res.status(500).json({ message: "Server error while deleting VM" });
  }
});

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});