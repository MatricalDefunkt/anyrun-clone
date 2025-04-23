import { useState, useEffect } from "react";
import { useAuth } from "../context/AuthContext";
import { VMService, VM } from "../services/VMService";

type ButtonStates = {
  starting: Record<number, boolean>;
  stopping: Record<number, boolean>;
  deleting: Record<number, boolean>;
};

export default function Dashboard() {
  const { user, logout } = useAuth();
  const [vms, setVms] = useState<VM[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [newVmName, setNewVmName] = useState("");
  const [isCreating, setIsCreating] = useState(false);
  const [createError, setCreateError] = useState("");

  // Separate state for each button type
  const [buttonStates, setButtonStates] = useState<ButtonStates>({
    starting: {},
    stopping: {},
    deleting: {},
  });

  useEffect(() => {
    loadVMs();
  }, []);

  const loadVMs = async () => {
    try {
      setLoading(true);
      const data = await VMService.getVMs();
      setVms(data);
      setError("");
    } catch (err) {
      setError("Failed to load VMs. Please try again.");
      console.error("Error loading VMs:", err);
    } finally {
      setLoading(false);
    }
  };

  const handleCreateVM = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newVmName.trim()) return;

    setIsCreating(true);
    setCreateError("");

    try {
      const newVM = await VMService.createVM(newVmName);
      setVms([...vms, newVM]);
      setNewVmName("");
    } catch (err: any) {
      setCreateError(err.response?.data?.message || "Failed to create VM");
    } finally {
      setIsCreating(false);
    }
  };

  const handleStartVM = async (id: number) => {
    try {
      // Only update the starting state for this specific VM
      setButtonStates((prev) => ({
        ...prev,
        starting: { ...prev.starting, [id]: true },
      }));
      setError("");

      const updatedVM = await VMService.startVM(id);
      setVms(vms.map((vm) => (vm.id === id ? updatedVM : vm)));
    } catch (err: any) {
      setError(err.response?.data?.message || "Failed to start VM");
    } finally {
      setButtonStates((prev) => ({
        ...prev,
        starting: { ...prev.starting, [id]: false },
      }));
    }
  };

  const handleStopVM = async (id: number) => {
    try {
      // Only update the stopping state for this specific VM
      setButtonStates((prev) => ({
        ...prev,
        stopping: { ...prev.stopping, [id]: true },
      }));
      setError("");

      const updatedVM = await VMService.stopVM(id);
      setVms(vms.map((vm) => (vm.id === id ? updatedVM : vm)));
    } catch (err: any) {
      setError(err.response?.data?.message || "Failed to stop VM");
    } finally {
      setButtonStates((prev) => ({
        ...prev,
        stopping: { ...prev.stopping, [id]: false },
      }));
    }
  };

  const handleDeleteVM = async (id: number) => {
    if (!confirm("Are you sure you want to delete this VM?")) return;

    try {
      // Only update the deleting state for this specific VM
      setButtonStates((prev) => ({
        ...prev,
        deleting: { ...prev.deleting, [id]: true },
      }));
      setError("");

      await VMService.deleteVM(id);
      setVms(vms.filter((vm) => vm.id !== id));
    } catch (err: any) {
      setError(err.response?.data?.message || "Failed to delete VM");
      setButtonStates((prev) => ({
        ...prev,
        deleting: { ...prev.deleting, [id]: false },
      }));
    }
  };

  const handleConnectVM = (id: number) => {
    const connectionUrl = VMService.getConnectionUrl(id);
    window.open(connectionUrl, "_blank");
  };

  const getVmStatusColor = (status: string) => {
    return status === "running"
      ? "bg-green-100 text-green-800"
      : "bg-gray-100 text-gray-800";
  };

  return (
    <div className="min-h-screen bg-gray-50">
      <nav className="bg-white shadow">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between h-16">
            <div className="flex">
              <div className="flex-shrink-0 flex items-center">
                <h1 className="text-xl font-bold text-indigo-600">
                  AnyRun Clone
                </h1>
              </div>
            </div>
            <div className="flex items-center">
              <span className="mr-4">Hello, {user?.username}</span>
              <button
                onClick={logout}
                className="inline-flex items-center px-3 py-2 border border-transparent text-sm leading-4 font-medium rounded-md text-white bg-indigo-600 hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500"
              >
                Sign out
              </button>
            </div>
          </div>
        </div>
      </nav>

      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
        <div className="bg-white shadow overflow-hidden sm:rounded-lg">
          <div className="px-4 py-5 sm:px-6">
            <h3 className="text-lg leading-6 font-medium text-gray-900">
              Virtual Machines
            </h3>
            <p className="mt-1 max-w-2xl text-sm text-gray-500">
              You can run up to 3 virtual machines at a time.
            </p>
          </div>

          {error && (
            <div
              className="mx-4 mb-4 p-4 text-sm text-red-800 rounded-lg bg-red-50"
              role="alert"
            >
              {error}
            </div>
          )}

          <div className="border-t border-gray-200 px-4 py-5 sm:px-6">
            {loading ? (
              <div className="flex justify-center py-8">
                <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-indigo-600"></div>
              </div>
            ) : vms.length === 0 ? (
              <div className="text-center py-8 text-gray-500">
                You don't have any virtual machines yet. Create one below.
              </div>
            ) : (
              <div className="mt-4 space-y-4">
                {vms.map((vm) => (
                  <div
                    key={vm.id}
                    className="bg-gray-50 px-4 py-4 sm:px-6 rounded-lg shadow-sm border border-gray-200"
                  >
                    <div className="flex items-center justify-between">
                      <div>
                        <h4 className="text-lg font-medium text-gray-900">
                          {vm.name}
                        </h4>
                        <p className="mt-1 text-sm text-gray-500">
                          Created on{" "}
                          {new Date(vm.created_at).toLocaleDateString()}
                        </p>
                        <span
                          className={`inline-flex mt-2 items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${getVmStatusColor(
                            vm.status
                          )}`}
                        >
                          {vm.status}
                        </span>
                      </div>
                      <div className="flex space-x-2">
                        {vm.status === "stopped" ? (
                          <button
                            onClick={() => handleStartVM(vm.id)}
                            disabled={buttonStates.starting[vm.id]}
                            className="inline-flex items-center px-3 py-2 border border-transparent text-sm leading-4 font-medium rounded-md text-white bg-green-600 hover:bg-green-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-green-500 disabled:bg-green-400 disabled:cursor-not-allowed"
                          >
                            {buttonStates.starting[vm.id]
                              ? "Starting..."
                              : "Start"}
                          </button>
                        ) : (
                          <button
                            onClick={() => handleStopVM(vm.id)}
                            disabled={buttonStates.stopping[vm.id]}
                            className="inline-flex items-center px-3 py-2 border border-transparent text-sm leading-4 font-medium rounded-md text-white bg-red-600 hover:bg-red-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-red-500 disabled:bg-red-400 disabled:cursor-not-allowed"
                          >
                            {buttonStates.stopping[vm.id]
                              ? "Stopping..."
                              : "Stop"}
                          </button>
                        )}
                        <button
                          onClick={() => handleDeleteVM(vm.id)}
                          disabled={buttonStates.deleting[vm.id]}
                          className="inline-flex items-center px-3 py-2 border border-gray-300 text-sm leading-4 font-medium rounded-md text-gray-700 bg-white hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500 disabled:bg-gray-200 disabled:cursor-not-allowed"
                        >
                          {buttonStates.deleting[vm.id]
                            ? "Deleting..."
                            : "Delete"}
                        </button>
                        {vm.status === "running" && (
                          <button
                            onClick={() => handleConnectVM(vm.id)}
                            className="inline-flex items-center px-3 py-2 border border-transparent text-sm leading-4 font-medium rounded-md text-white bg-indigo-600 hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500"
                          >
                            Connect
                          </button>
                        )}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}

            {vms.length < 3 && (
              <div className="mt-6">
                <div className="bg-gray-50 px-4 py-5 sm:px-6 rounded-lg border border-gray-200">
                  <h4 className="text-lg font-medium text-gray-900">
                    Create new VM
                  </h4>
                  {createError && (
                    <div
                      className="mt-2 p-2 text-sm text-red-800 rounded-lg bg-red-50"
                      role="alert"
                    >
                      {createError}
                    </div>
                  )}
                  <form onSubmit={handleCreateVM} className="mt-3 flex">
                    <input
                      type="text"
                      placeholder="Enter VM name"
                      value={newVmName}
                      onChange={(e) => setNewVmName(e.target.value)}
                      className="flex-1 shadow-sm focus:ring-indigo-500 focus:border-indigo-500 block w-full sm:text-sm border-gray-300 rounded-md"
                      disabled={isCreating}
                    />
                    <button
                      type="submit"
                      disabled={isCreating || !newVmName.trim()}
                      className="ml-3 inline-flex items-center px-4 py-2 border border-transparent text-sm font-medium rounded-md shadow-sm text-white bg-indigo-600 hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500 disabled:bg-indigo-400 disabled:cursor-not-allowed"
                    >
                      {isCreating ? "Creating..." : "Create VM"}
                    </button>
                  </form>
                </div>
              </div>
            )}
          </div>
        </div>
      </main>
    </div>
  );
}
