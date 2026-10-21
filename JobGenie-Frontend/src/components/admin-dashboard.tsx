import { useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { apiRequest } from "@/lib/queryClient";
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/context/AuthContext";

interface AdminStats {
  totalUsers: number;
  totalResumes: number;
  totalJobsMatched: number;
  totalJobsApplied: number;
  systemHealth: string;
  errorLogs: number;
  errorLogsPartial: boolean;
}

export default function AdminDashboard() {
  const [stats, setStats] = useState<AdminStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [users, setUsers] = useState<any[]>([]);
  const [usersLoading, setUsersLoading] = useState(false);
  const { user, isAdmin } = useAuth();

  useEffect(() => {
    async function fetchStats() {
      setLoading(true);
      try {
        // Replace with your actual backend/admin API endpoints
        const json = (url: string) => apiRequest("GET", url).then((r) => r.json());
        const [users, resumes, jobsMatched, jobsApplied, health, errors] = await Promise.all([
          json("/api/admin/users/count"),
          json("/api/admin/resumes/count"),
          json("/api/admin/jobs/matched/count"),
          json("/api/admin/jobs/applied/count"),
          json("/api/admin/health"),
          json("/api/admin/errors/count"),
        ]);
        setStats({
          totalUsers: users.count,
          totalResumes: resumes.count,
          totalJobsMatched: jobsMatched.count,
          totalJobsApplied: jobsApplied.count,
          systemHealth: health.status,
          errorLogs: errors.count,
          errorLogsPartial: Boolean(errors.isPartial),
        });
      } catch (e) {
        setStats(null);
      }
      setLoading(false);
    }
    fetchStats();
  }, []);

  useEffect(() => {
    if (isAdmin && user) {
      setUsersLoading(true);
      apiRequest("GET", "/api/users")
        .then((r) => r.json())
        .then(setUsers)
        .catch(() => setUsers([]))
        .finally(() => setUsersLoading(false));
    }
  }, [isAdmin, user]);

  const handleRoleChange = async (userId: string, newRole: string) => {
    if (!user) return;
    await apiRequest("PUT", `/api/users/${userId}/role?role=${encodeURIComponent(newRole)}`);
    setUsers((prev) => prev.map((u) => (u.id === userId ? { ...u, role: newRole } : u)));
  };

  if (loading) {
    return (
      <div className="flex justify-center items-center h-64">
        <span className="text-lg text-gray-500">Loading admin stats...</span>
      </div>
    );
  }

  if (!stats) {
    return (
      <div className="flex justify-center items-center h-64">
        <span className="text-lg text-red-500">Failed to load admin stats.</span>
      </div>
    );
  }

  return (
    <div className="max-w-5xl mx-auto py-10 space-y-8">
      <h2 className="text-3xl font-bold text-gray-900 mb-6 text-center">Admin Dashboard</h2>
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center">
              <i className="fas fa-users mr-2 text-blue-600"></i>
              Total Users
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold text-blue-700">{stats.totalUsers}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center">
              <i className="fas fa-file-alt mr-2 text-purple-600"></i>
              Resumes Uploaded
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold text-purple-700">{stats.totalResumes}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center">
              <i className="fas fa-magic mr-2 text-green-600"></i>
              Jobs Matched
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold text-green-700">{stats.totalJobsMatched}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center">
              <i className="fas fa-briefcase mr-2 text-yellow-600"></i>
              Jobs Applied
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold text-yellow-700">{stats.totalJobsApplied}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center">
              <i className="fas fa-heartbeat mr-2 text-red-600"></i>
              System Health
            </CardTitle>
          </CardHeader>
          <CardContent>
            <Badge className={
              stats.systemHealth === "UP"
                ? "bg-green-100 text-green-800"
                : "bg-red-100 text-red-800"
            }>
              {stats.systemHealth}
            </Badge>
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center">
              <i className="fas fa-exclamation-triangle mr-2 text-red-500"></i>
              Error Logs
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold text-red-700">{stats.errorLogs}</div>
            {stats.errorLogsPartial && (
              <p className="mt-1 text-xs text-amber-700">
                Not yet tracked — no error/log monitoring is wired up in this deployment.
              </p>
            )}
          </CardContent>
        </Card>
      </div>
      {isAdmin && (
        <div className="mt-10">
          <h3 className="text-xl font-bold mb-4">User Management</h3>
          {usersLoading ? (
            <div>Loading users...</div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>ID</TableHead>
                  <TableHead>Name</TableHead>
                  <TableHead>Email</TableHead>
                  <TableHead>Role</TableHead>
                  <TableHead>Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {users.map((u) => (
                  <TableRow key={u.id}>
                    <TableCell>{u.id}</TableCell>
                    <TableCell>{u.name}</TableCell>
                    <TableCell>{u.email}</TableCell>
                    <TableCell>{u.role}</TableCell>
                    <TableCell>
                      {u.role === "admin" ? (
                        <Button size="sm" variant="outline" onClick={() => handleRoleChange(u.id, "user")}>Demote</Button>
                      ) : (
                        <Button size="sm" variant="default" onClick={() => handleRoleChange(u.id, "admin")}>Promote</Button>
                      )}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </div>
      )}
    </div>
  );
} 