# Secure Sandbox Environment Manager

Secure Sandbox Environment Manager is a full-stack web application designed to provide users with on-demand, isolated environments for dynamic analysis and secure application testing. This platform leverages Docker containerization to create ephemeral "virtual machines," offering a controlled space for users to execute and observe applications without risk to their local systems.

## Features

- **Dynamic Docker-based Sandbox Provisioning:** Create, start, stop, and remove Docker containers on-demand.
- **Secure User and Session Management:** User registration and login with bcrypt password hashing and JWT for API authentication.
- **RESTful API:** Backend built with Node.js and Express.js.
- **SQLite Database:** Persistent storage for user and environment metadata.
- **Responsive Frontend:** Built with React, Vite, and TypeScript, styled with TailwindCSS.

## Prerequisites

- [Node.js](https://nodejs.org/) (v22.x or later recommended)
- [Docker](https://www.docker.com/get-started)
- [Git](https://git-scm.com/)

## Cloning the Repository

```bash
git clone https://github.com/MatricalDefunkt/ssem
cd ssem
```

## Running the Application

### 1. Backend Setup

Navigate to the backend directory:

```bash
cd backend
```

Install dependencies:

```bash
npm install
```

Create a `.env` file in the `backend` directory and add the following environment variables. Replace `your-secret-key` with a strong, unique secret.

```env
PORT=5000
JWT_SECRET=your-secret-key
```

Build the backend (if you plan to use `npm start`):

```bash
npm run build
```

Run the backend development server:

```bash
npm run dev
```

Alternatively, to run the built version:

```bash
npm start
```

The backend server will start, typically on `http://localhost:5000`.

### 2. Frontend Setup

Open a new terminal and navigate to the frontend directory:

```bash
cd frontend
```

Install dependencies:

```bash
npm install
```

Run the frontend development server:

```bash
npm run dev
```

The frontend development server will start, typically on `http://localhost:5173` (Vite's default) or another port if 5173 is in use. Open this URL in your browser.

### 3. Docker Setup

Ensure Docker Desktop (or Docker Engine on Linux) is running. The application will attempt to build a Docker image named `ssem-vm-image` using the `Dockerfile` in the project root and then create containers from this image.

## Screenshots

![Login Page](https://github.com/user-attachments/assets/17d2b678-9b6c-4c47-900d-a30e8ff817b1)


![Dashboard](https://github.com/user-attachments/assets/706f1ad4-3d7e-4982-a935-5e4a4a620941)


![Dashboard with VM](https://github.com/user-attachments/assets/3d2a7482-d5c7-432b-8764-fefff611c23c)


![VM Screen](https://github.com/user-attachments/assets/5f100b2e-a935-4a95-9ec9-47c633c12d01)


## Technologies Used

- **Backend:** Node.js, Express.js, SQLite, JWT (jsonwebtoken), bcryptjs, TypeScript, Bun
- **Frontend:** React, Vite, TypeScript, TailwindCSS, Axios
- **Database:** SQLite

## API Endpoints

A brief overview of the main API endpoints (all prefixed with `/api`):

- `POST /register`: Register a new user.
- `POST /login`: Log in an existing user, returns a JWT.
- `GET /vms`: (Authenticated) Get a list of VMs for the logged-in user.
- `POST /vms`: (Authenticated) Create a new VM.
- `PUT /vms/:id/status`: (Authenticated) Update VM status (start/stop).
- `DELETE /vms/:id`: (Authenticated) Delete a VM.

_(More details can be added here or linked to API documentation if available)_
