import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { insertUserSchema, InsertUser } from "@shared/schema";
import { useUsers, useCreateUser } from "@/hooks/use-users";
import { LayoutShell } from "@/components/layout-shell";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Plus, Shield, User, UserPlus } from "lucide-react";
import { format } from "date-fns";

export default function UsersPage() {
  const { data: users, isLoading } = useUsers();
  const [open, setOpen] = useState(false);
  const createUser = useCreateUser();

  const form = useForm<InsertUser>({
    resolver: zodResolver(insertUserSchema),
    defaultValues: {
      username: "",
      password: "",
      role: "employee",
      status: "active",
    },
  });

  function onSubmit(data: InsertUser) {
    createUser.mutate(data, {
      onSuccess: () => {
        setOpen(false);
        form.reset();
      },
    });
  }

  return (
    <LayoutShell>
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold font-display">User Management</h1>
            <p className="text-muted-foreground">Manage system access and roles</p>
          </div>
          <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger asChild>
              <Button className="gap-2">
                <UserPlus className="w-4 h-4" />
                Add User
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Add New User</DialogTitle>
              </DialogHeader>
              <Form {...form}>
                <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
                  <FormField
                    control={form.control}
                    name="username"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Username</FormLabel>
                        <FormControl>
                          <Input placeholder="jdoe" {...field} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={form.control}
                    name="password"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Password</FormLabel>
                        <FormControl>
                          <Input type="password" placeholder="••••••••" {...field} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={form.control}
                    name="role"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Role</FormLabel>
                        <Select onValueChange={field.onChange} defaultValue={field.value}>
                          <FormControl>
                            <SelectTrigger>
                              <SelectValue placeholder="Select a role" />
                            </SelectTrigger>
                          </FormControl>
                          <SelectContent>
                            <SelectItem value="admin">Admin</SelectItem>
                            <SelectItem value="staff">Staff</SelectItem>
                            <SelectItem value="employee">Employee</SelectItem>
                          </SelectContent>
                        </Select>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <Button type="submit" className="w-full" disabled={createUser.isPending}>
                    {createUser.isPending ? "Creating..." : "Create User"}
                  </Button>
                </form>
              </Form>
            </DialogContent>
          </Dialog>
        </div>

        <div className="bg-card rounded-2xl border border-border shadow-sm overflow-hidden">
          {isLoading ? (
            <div className="p-6 space-y-4">
              {[1, 2, 3].map((i) => <Skeleton key={i} className="h-12 w-full" />)}
            </div>
          ) : (
            <div className="divide-y divide-border/50">
              <div className="grid grid-cols-12 gap-4 px-6 py-3 bg-muted/30 text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                <div className="col-span-4">User</div>
                <div className="col-span-3">Role</div>
                <div className="col-span-3">Status</div>
                <div className="col-span-2">Created</div>
              </div>
              {users?.map((user) => (
                <div key={user.id} className="grid grid-cols-12 gap-4 px-6 py-4 items-center hover:bg-muted/30 transition-colors">
                  <div className="col-span-4 flex items-center gap-3">
                    <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center text-primary">
                      <User className="w-4 h-4" />
                    </div>
                    <span className="font-medium">{user.username}</span>
                  </div>
                  <div className="col-span-3">
                    <span className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-medium capitalize border ${
                      user.role === 'admin' 
                        ? 'bg-purple-50 text-purple-700 border-purple-200' 
                        : 'bg-slate-50 text-slate-700 border-slate-200'
                    }`}>
                      {user.role === 'admin' && <Shield className="w-3 h-3" />}
                      {user.role}
                    </span>
                  </div>
                  <div className="col-span-3">
                    <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-green-50 text-green-700 border border-green-200 capitalize">
                      {user.status}
                    </span>
                  </div>
                  <div className="col-span-2 text-sm text-muted-foreground">
                    {user.createdAt ? format(new Date(user.createdAt), "MMM d, yyyy") : "-"}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </LayoutShell>
  );
}
