import axios from "axios";

const API_URL = "http://localhost:5000/api";

export interface VM {
  id: number;
  user_id: number;
  name: string;
  status: "running" | "stopped";
  created_at: string;
  port?: number;
  containerId?: string;
}

export const VMService = {
  // Get all VMs for current user
  getVMs: async (): Promise<VM[]> => {
    try {
      const response = await axios.get(`${API_URL}/vms`);
      return response.data.vms;
    } catch (error) {
      console.error("Error fetching VMs:", error);
      throw error;
    }
  },

  // Create a new VM
  createVM: async (name: string): Promise<VM> => {
    try {
      const response = await axios.post(`${API_URL}/vms`, { name });
      return response.data.vm;
    } catch (error) {
      console.error("Error creating VM:", error);
      throw error;
    }
  },

  // Start a VM
  startVM: async (id: number): Promise<VM> => {
    try {
      const response = await axios.put(`${API_URL}/vms/${id}/status`, {
        status: "running",
      });
      return response.data.vm;
    } catch (error) {
      console.error("Error starting VM:", error);
      throw error;
    }
  },

  // Stop a VM
  stopVM: async (id: number): Promise<VM> => {
    try {
      const response = await axios.put(`${API_URL}/vms/${id}/status`, {
        status: "stopped",
      });
      return response.data.vm;
    } catch (error) {
      console.error("Error stopping VM:", error);
      throw error;
    }
  },

  // Delete a VM
  deleteVM: async (id: number): Promise<void> => {
    try {
      await axios.delete(`${API_URL}/vms/${id}`);
    } catch (error) {
      console.error("Error deleting VM:", error);
      throw error;
    }
  },

  // Get connection URL for a VM
  getConnectionUrl: (vmId: number): string => {
    // The port is 6080 + vmId
    const port = 6080 + vmId;
    return `http://localhost:${port}/vnc.html?autoconnect=true`;
  },
};
